//! Bounded projections. SQL applies filters and pagination before materializing output.
use crate::{AppError, engine::Engine, index::Indexed};
use chrono::Days;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
fn offset(cursor: Option<&str>, scope: &Value) -> Result<u64, AppError> {
    let Some(cursor) = cursor else { return Ok(0) };
    if cursor.len() > 4096 {
        return Err(AppError::reject(400, "INVALID_CURSOR"));
    }
    let value: Value =
        serde_json::from_str(cursor).map_err(|_| AppError::reject(400, "INVALID_CURSOR"))?;
    if value[0] != *scope {
        return Err(AppError::reject(409, "PAGE_STALE"));
    }
    value[1]
        .as_u64()
        .filter(|n| *n <= i64::MAX as u64)
        .ok_or_else(|| AppError::reject(400, "INVALID_CURSOR"))
}
fn page(scope: &Value, revision: &str, start: u64, count: usize, more: bool) -> Value {
    json!({"next_cursor":more.then(||json!([scope,start+count as u64]).to_string()),"snapshot_cursor":revision,"has_more":more,"freshness":"index_snapshot"})
}
fn bounded(limit: u32, max: u32) -> Result<(), AppError> {
    if limit == 0 || limit > max {
        Err(AppError::reject(400, "INVALID_LIMIT"))
    } else {
        Ok(())
    }
}
const ACTIVE: &str = "COALESCE(json_extract(d.metadata_json,'$.archived'),0)=0 AND COALESCE(json_extract(d.metadata_json,'$.status'),'') NOT IN ('done','cancelled','achieved') AND COALESCE(json_extract(d.metadata_json,'$.state'),'')!='archived' AND NOT EXISTS(SELECT 1 FROM documents p WHERE p.project_id=d.project_id AND p.entity_type='project' AND json_extract(p.metadata_json,'$.state')='archived')";
impl Engine {
    pub fn attention(&self, cursor: Option<&str>, limit: u32, now: i64) -> Result<Value, AppError> {
        self.attention_project(None, cursor, limit, now)
    }
    pub fn attention_project(
        &self,
        project: Option<&str>,
        cursor: Option<&str>,
        limit: u32,
        now: i64,
    ) -> Result<Value, AppError> {
        bounded(limit, 200)?;
        let workspace = self.workspace()?.0;
        let zone = workspace["timezone"]
            .as_str()
            .ok_or(AppError::State)?
            .parse::<chrono_tz::Tz>()
            .map_err(|_| AppError::State)?;
        let today = chrono::DateTime::from_timestamp_millis(now)
            .ok_or(AppError::State)?
            .with_timezone(&zone)
            .date_naive();
        let soon = today
            .checked_add_days(Days::new(7))
            .ok_or(AppError::State)?;
        self.index.with_snapshot(|db,revision|{
            let scope=json!(["attention",revision,project,today.to_string(),limit]);let start=offset(cursor,&scope)?;
            let sql=format!("WITH candidates AS (
              SELECT project_id,entity_id,entity_type,title,'overdue' reason,json_extract(metadata_json,'$.due.date') date,0 weight FROM documents d WHERE {ACTIVE} AND (?5 IS NULL OR d.project_id=?5) AND json_extract(metadata_json,'$.due.kind')='hard' AND json_extract(metadata_json,'$.due.date')<?1
              UNION ALL SELECT project_id,entity_id,entity_type,title,'due_soon',json_extract(metadata_json,'$.due.date'),3 FROM documents d WHERE {ACTIVE} AND (?5 IS NULL OR d.project_id=?5) AND json_extract(metadata_json,'$.due.kind')='hard' AND json_extract(metadata_json,'$.due.date') BETWEEN ?1 AND ?2
              UNION ALL SELECT project_id,entity_id,entity_type,title,'review_due',json_extract(metadata_json,'$.review_on'),2 FROM documents d WHERE {ACTIVE} AND (?5 IS NULL OR d.project_id=?5) AND json_extract(metadata_json,'$.review_on')<=?1
              UNION ALL SELECT project_id,entity_id,entity_type,title,'blocked',NULL,1 FROM documents d WHERE {ACTIVE} AND (?5 IS NULL OR d.project_id=?5) AND entity_type='card' AND json_type(metadata_json,'$.blocked')='object'
              UNION ALL SELECT project_id,entity_id,entity_type,title,'review',NULL,4 FROM documents d WHERE {ACTIVE} AND (?5 IS NULL OR d.project_id=?5) AND entity_type='card' AND json_extract(metadata_json,'$.status')='review'
              UNION ALL SELECT d.project_id,d.entity_id,d.entity_type,d.title,'decision_needed',NULL,1 FROM documents d WHERE {ACTIVE} AND (?5 IS NULL OR d.project_id=?5) AND entity_type='update' AND json_extract(metadata_json,'$.kind')='decision_needed' AND NOT EXISTS(SELECT 1 FROM documents r WHERE r.project_id=d.project_id AND r.entity_type='update' AND ((json_extract(r.metadata_json,'$.kind')='resolution' AND EXISTS(SELECT 1 FROM json_each(r.metadata_json,'$.resolves') edge WHERE edge.value=d.entity_id)) OR (json_extract(r.metadata_json,'$.kind')='correction' AND json_extract(r.metadata_json,'$.supersedes')=d.entity_id)))
            ) SELECT project_id,entity_id,entity_type,title,reason,date FROM candidates ORDER BY weight,date,project_id,entity_id,reason LIMIT ?3 OFFSET ?4");
            let mut statement=db.prepare(&sql)?;
            let mut items=statement.query_map(params![today.to_string(),soon.to_string(),limit+1,start as i64,project],|r|{let project:String=r.get(0)?;let id:String=r.get(1)?;let kind:String=r.get(2)?;let title:String=r.get(3)?;let reason:String=r.get(4)?;let date:Option<String>=r.get(5)?;
                let mut item=json!({"id":format!("{project}:{id}:{reason}"),"project_id":project,"target":{"type":if kind=="update"{"project"}else{&kind},"id":if kind=="update"{project.as_str()}else{id.as_str()}},"reason":reason,"label":title});
                if kind=="update"{item["report_id"]=json!(id);}
                if let Some(date)=date{item["date"]=json!(date);}Ok(item)
            })?.collect::<Result<Vec<_>,_>>()?;
            for item in &mut items {if let Some(id)=item.as_object_mut().unwrap().remove("report_id"){
                let text:String=db.query_row("SELECT json_extract(metadata_json,'$.target') FROM documents WHERE project_id=?1 AND entity_id=?2 AND entity_type='update'",params![item["project_id"].as_str().unwrap(),id.as_str().unwrap()],|r|r.get(0))?;
                item["target"]=serde_json::from_str(&text).map_err(|_|AppError::State)?;
            }}
            let more=items.len()>limit as usize;items.truncate(limit as usize);
            Ok(json!({"page":page(&scope,revision,start,items.len(),more),"items":items}))
        })
    }
    pub fn calendar(
        &self,
        project: Option<&str>,
        from: &str,
        to: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<Value, AppError> {
        bounded(limit, 1000)?;
        let first = project_domain::local_date(from)
            .map_err(|_| AppError::reject(400, "INVALID_DATE_RANGE"))?;
        let last = project_domain::local_date(to)
            .map_err(|_| AppError::reject(400, "INVALID_DATE_RANGE"))?;
        if last < first || (last - first).num_days() >= 400 {
            return Err(AppError::reject(400, "INVALID_DATE_RANGE"));
        }
        self.index.with_snapshot(|db,revision|{
            let scope=json!(["calendar",revision,project,from,to,limit]);let start=offset(cursor,&scope)?;
            let mut statement=db.prepare("WITH selected AS(SELECT * FROM documents WHERE (?1 IS NULL OR project_id=?1) AND COALESCE(json_extract(metadata_json,'$.archived'),0)=0), dates AS (
              SELECT project_id,entity_id,source_hash,title,'card_schedule' kind,json_extract(metadata_json,'$.schedule.start') start,json_extract(metadata_json,'$.schedule.end') end,NULL due_kind FROM selected WHERE entity_type='card'
              UNION ALL SELECT project_id,entity_id,source_hash,title,'card_due',json_extract(metadata_json,'$.due.date'),json_extract(metadata_json,'$.due.date'),json_extract(metadata_json,'$.due.kind') FROM selected WHERE entity_type='card'
              UNION ALL SELECT project_id,entity_id,source_hash,title,'milestone_due',json_extract(metadata_json,'$.due.date'),json_extract(metadata_json,'$.due.date'),json_extract(metadata_json,'$.due.kind') FROM selected WHERE entity_type='milestone'
              UNION ALL SELECT project_id,entity_id,source_hash,title,CASE WHEN entity_type='project' THEN 'project_review' ELSE 'card_review' END,json_extract(metadata_json,'$.review_on'),json_extract(metadata_json,'$.review_on'),NULL FROM selected WHERE entity_type IN ('project','card')
            ) SELECT project_id,entity_id,source_hash,title,kind,start,end,due_kind FROM dates WHERE start<=?3 AND end>=?2 ORDER BY start,project_id,entity_id,kind LIMIT ?4 OFFSET ?5")?;
            let mut items=statement.query_map(params![project,from,to,limit+1,start as i64],|r|{let project:String=r.get(0)?;let id:String=r.get(1)?;let kind:String=r.get(4)?;
                let mut item=json!({"item_id":format!("{id}:{kind}"),"kind":kind,"project_id":project,"resource_id":id,"version":r.get::<_,String>(2)?,"title":r.get::<_,String>(3)?,"start":r.get::<_,String>(5)?,"end":r.get::<_,String>(6)?});
                if let Some(due)=r.get::<_,Option<String>>(7)?{item["due_kind"]=json!(due);}Ok(item)
            })?.collect::<Result<Vec<_>,_>>()?;
            let more=items.len()>limit as usize;items.truncate(limit as usize);
            Ok(json!({"page":page(&scope,revision,start,items.len(),more),"items":items,"warnings":[]}))
        })
    }
    pub fn gantt(
        &self,
        project: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<Value, AppError> {
        bounded(limit, 500)?;
        self.index.with_snapshot(|db,revision|{
            let scope=json!(["gantt",revision,project,limit]);let start=offset(cursor,&scope)?;
            let mut rows=rows(db,project,None,limit+1,start,true)?;let more=rows.len()>limit as usize;rows.truncate(limit as usize);
            let mut edges=Vec::new();
            let mut warnings=Vec::new();
            for row in &rows {
                warnings.extend(project_domain::date_warnings(&row.metadata));
                for dependency in row.metadata["depends_on"].as_array().into_iter().flatten() {
                    if let Some(id)=dependency.as_str() {
                        let predecessor:Option<(Option<String>,String)>=db.query_row("SELECT json_extract(metadata_json,'$.schedule.end'),validity FROM documents WHERE project_id=?1 AND entity_type='card' AND entity_id=?2",params![project,id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
                        let warning=match predecessor {
                            None=>Some("DEPENDENCY_MISSING"),
                            Some((_,validity)) if validity!="valid"=>Some("DEPENDENCY_STALE"),
                            Some((Some(end),_)) if row.metadata["schedule"]["start"].as_str().is_some_and(|start| start<=end.as_str())=>Some("DEPENDENCY_DATE_CONFLICT"),
                            _=>None,
                        };
                        edges.push(json!({"from":id,"to":row.id,"kind":"finish_to_start","outside_page":!rows.iter().any(|r|r.id==id),"warning":warning}));
                    }
                }
            }
            Ok(json!({"rows":rows.iter().map(Indexed::summary).collect::<Vec<_>>(),"edges":edges,"page":page(&scope,revision,start,rows.len(),more),"warnings":warnings.into_iter().take(100).collect::<Vec<_>>()}))
        })
    }
    pub fn board(
        &self,
        project: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<Value, AppError> {
        bounded(limit, 200)?;
        self.index.with_snapshot(|db,revision|{
            let scope=json!(["board",revision,project,limit]);
            let (selected,start)=if let Some(cursor)=cursor{let value:Value=serde_json::from_str(cursor).map_err(|_|AppError::reject(400,"INVALID_CURSOR"))?;if value[0]!=scope{return Err(AppError::reject(409,"PAGE_STALE"));}(value[1].as_str().ok_or(AppError::State)?.to_owned(),value[2].as_u64().filter(|n|*n<=i64::MAX as u64).ok_or(AppError::State)?)}else{(String::new(),0)};
            let mut columns=Vec::new();
            for status in ["planned","active","review","done","cancelled"]{
                let start=if selected==status{start}else{0};let mut values=rows(db,project,Some(status),limit+1,start,false)?;
                let more=values.len()>limit as usize;values.truncate(limit as usize);
                let total:i64=db.query_row("SELECT count(*) FROM documents WHERE project_id=?1 AND entity_type='card' AND json_extract(metadata_json,'$.status')=?2 AND COALESCE(json_extract(metadata_json,'$.archived'),0)=0",[project,status],|r|r.get(0))?;
                let mut page=page(&scope,revision,start,values.len(),more);page["next_cursor"]=json!(more.then(||json!([scope,status,start+values.len()as u64]).to_string()));
                columns.push(json!({"status":status,"items":values.iter().map(Indexed::summary).collect::<Vec<_>>(),"page":page,"total":total}));
            }
            Ok(json!({"columns":columns,"snapshot_cursor":revision,"warnings":[]}))
        })
    }
}
fn rows(
    db: &Connection,
    project: &str,
    status: Option<&str>,
    limit: u32,
    offset: u64,
    include_milestones: bool,
) -> Result<Vec<Indexed>, AppError> {
    let mut statement=db.prepare("SELECT entity_id,source_hash,metadata_json,validity,entity_type FROM documents WHERE project_id=?1 AND (entity_type='card' OR (?5 AND entity_type='milestone')) AND (?2 IS NULL OR json_extract(metadata_json,'$.status')=?2) AND COALESCE(json_extract(metadata_json,'$.archived'),0)=0 ORDER BY entity_type,json_extract(metadata_json,'$.status'),json_extract(metadata_json,'$.position'),entity_id LIMIT ?3 OFFSET ?4")?;
    statement
        .query_map(
            params![project, status, limit, offset as i64, include_milestones],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            },
        )?
        .map(|r| {
            let (id, version, metadata, validity, kind) = r?;
            Ok(Indexed {
                project_id: project.into(),
                kind,
                id,
                version,
                metadata: serde_json::from_str(&metadata).map_err(|_| AppError::State)?,
                validity,
            })
        })
        .collect()
}
