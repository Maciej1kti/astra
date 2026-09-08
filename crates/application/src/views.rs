//! Bounded projections. SQL applies filters and pagination before materializing output.
use crate::{
    AppError,
    engine::Engine,
    index::{Indexed, ProjectionStatus, page_revision},
};
use chrono::Days;
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
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
fn page(
    scope: &Value,
    revision: &str,
    start: u64,
    count: usize,
    more: bool,
    freshness: &str,
) -> Value {
    json!({"next_cursor":more.then(||json!([scope,start+count as u64]).to_string()),"snapshot_cursor":revision,"has_more":more,"freshness":freshness})
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
            let projection = ProjectionStatus::read(db, project)?;
            let scope=json!(["attention",page_revision(db, revision, project)?,project,today.to_string(),limit]);let start=offset(cursor,&scope)?;
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
            Ok(json!({"page":page(&scope,revision,start,items.len(),more,projection.freshness),"items":items,"warnings":projection.warnings}))
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
            let projection = ProjectionStatus::read(db, project)?;
            let scope=json!(["calendar",page_revision(db, revision, project)?,project,from,to,limit]);let start=offset(cursor,&scope)?;
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
            Ok(json!({"page":page(&scope,revision,start,items.len(),more,projection.freshness),"items":items,"warnings":projection.warnings}))
        })
    }
    pub fn gantt(
        &self,
        project: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<Value, AppError> {
        bounded(limit, 500)?;
        // Own every input and its revision before releasing the index lock.
        // Parsing and graph analysis below cannot delay unrelated index users.
        let snapshot = self.index.with_snapshot(|db, revision| {
            let projection = ProjectionStatus::read(db, Some(project))?;
            let scope = json!(["gantt", page_revision(db, revision, Some(project))?, project, limit]);
            let start = offset(cursor, &scope)?;
            let mut rows = self::rows(db, project, None, limit + 1, start, true)?;
            let more = rows.len() > limit as usize;
            rows.truncate(limit as usize);
            projection.mark_rows(&mut rows);
            let mut statement = db.prepare("SELECT entity_id,json_extract(metadata_json,'$.schedule'),json_extract(metadata_json,'$.depends_on'),validity FROM documents WHERE project_id=?1 AND entity_type='card' AND COALESCE(json_extract(metadata_json,'$.archived'),0)=0 AND COALESCE(json_extract(metadata_json,'$.status'),'')!='cancelled' ORDER BY entity_id LIMIT 10001")?;
            let mut cards = statement.query_map([project], |row| Ok(TimelineCard {
                id: row.get(0)?, schedule: row.get(1)?, dependencies: row.get(2)?, validity: row.get(3)?,
            }))?.collect::<Result<Vec<_>, _>>()?;
            let truncated = cards.len() > 10_000;
            cards.truncate(10_000);
            let ids: BTreeSet<&str> = rows.iter().flat_map(|row| row.metadata["depends_on"].as_array().into_iter().flatten().filter_map(Value::as_str)).collect();
            let predecessors = if ids.is_empty() {
                BTreeMap::new()
            } else {
                // These inputs include archived/cancelled and analysis-bound
                // predecessors, preserving edge warnings independently of forecasts.
                let mut statement = db.prepare("SELECT entity_id,json_extract(metadata_json,'$.schedule.end'),validity FROM documents WHERE project_id=?1 AND entity_type='card' AND entity_id IN (SELECT value FROM json_each(?2))")?;
                statement.query_map(params![project, serde_json::to_string(&ids).map_err(|_| AppError::State)?], |row| Ok((row.get(0)?, (row.get(1)?, row.get(2)?))))?.collect::<Result<_, _>>()?
            };
            Ok(GanttSnapshot { revision: revision.to_owned(), scope, start, rows, more, cards, truncated, predecessors, projection })
        })?;
        snapshot.render()
    }

    pub fn board(
        &self,
        project: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<Value, AppError> {
        bounded(limit, 200)?;
        self.index.with_snapshot(|db,revision|{
            let projection = ProjectionStatus::read(db, Some(project))?;
            let scope=json!(["board",page_revision(db, revision, Some(project))?,project,limit]);
            let (selected,start)=if let Some(cursor)=cursor{let value:Value=serde_json::from_str(cursor).map_err(|_|AppError::reject(400,"INVALID_CURSOR"))?;if value[0]!=scope{return Err(AppError::reject(409,"PAGE_STALE"));}(value[1].as_str().ok_or(AppError::State)?.to_owned(),value[2].as_u64().filter(|n|*n<=i64::MAX as u64).ok_or(AppError::State)?)}else{(String::new(),0)};
            let mut columns=Vec::new();
            for status in ["planned","active","review","done","cancelled"]{
                let start=if selected==status{start}else{0};let mut values=rows(db,project,Some(status),limit+1,start,false)?;
                let more=values.len()>limit as usize;values.truncate(limit as usize);projection.mark_rows(&mut values);
                let total:i64=db.query_row("SELECT count(*) FROM documents WHERE project_id=?1 AND entity_type='card' AND json_extract(metadata_json,'$.status')=?2 AND COALESCE(json_extract(metadata_json,'$.archived'),0)=0",[project,status],|r|r.get(0))?;
                let mut page=page(&scope,revision,start,values.len(),more,projection.freshness);page["next_cursor"]=json!(more.then(||json!([scope,status,start+values.len()as u64]).to_string()));
                columns.push(json!({"status":status,"items":values.iter().map(Indexed::summary).collect::<Vec<_>>(),"page":page,"total":total}));
            }
            Ok(json!({"columns":columns,"snapshot_cursor":revision,"warnings":projection.warnings}))
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

struct TimelineCard {
    id: String,
    schedule: Option<String>,
    dependencies: Option<String>,
    validity: String,
}

struct GanttSnapshot {
    revision: String,
    scope: Value,
    start: u64,
    rows: Vec<Indexed>,
    more: bool,
    cards: Vec<TimelineCard>,
    truncated: bool,
    predecessors: BTreeMap<String, (Option<String>, String)>,
    projection: ProjectionStatus,
}

impl GanttSnapshot {
    fn render(self) -> Result<Value, AppError> {
        let cards = self.cards.into_iter().map(|card| {
            let parse = |text: Option<String>| -> Result<Value, AppError> {
                text.map(|text| serde_json::from_str(&text).map_err(|_| AppError::State)).unwrap_or(Ok(Value::Null))
            };
            Ok(json!({"id":card.id,"schedule":parse(card.schedule)?,"depends_on":parse(card.dependencies)?,"x-analysis-invalid":card.validity!="valid" || self.projection.freshness=="stale"}))
        }).collect::<Result<Vec<_>, AppError>>()?;
        let analysis = project_domain::timeline::analyze(&cards, self.truncated);
        let forecasts = self
            .rows
            .iter()
            .filter_map(|row| analysis.forecasts.get(&row.id))
            .collect::<Vec<_>>();
        let page_ids: BTreeSet<&str> = self.rows.iter().map(|row| row.id.as_str()).collect();
        let mut edges = Vec::new();
        let mut warnings = self.projection.warnings;
        for row in &self.rows {
            warnings.extend(project_domain::date_warnings(&row.metadata));
            for id in row.metadata["depends_on"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
            {
                let warning = match self.predecessors.get(id) {
                    None => Some("DEPENDENCY_MISSING"),
                    Some((_, validity))
                        if validity != "valid" || self.projection.freshness == "stale" =>
                    {
                        Some("DEPENDENCY_STALE")
                    }
                    Some((Some(end), _))
                        if row.metadata["schedule"]["start"]
                            .as_str()
                            .is_some_and(|start| start <= end.as_str()) =>
                    {
                        Some("DEPENDENCY_DATE_CONFLICT")
                    }
                    _ => None,
                };
                edges.push(json!({"from":id,"to":row.id,"kind":"finish_to_start","outside_page":!page_ids.contains(id),"warning":warning}));
            }
        }
        Ok(
            json!({"analysis":analysis,"forecasts":forecasts,"rows":self.rows.iter().map(Indexed::summary).collect::<Vec<_>>(),"edges":edges,"page":page(&self.scope,&self.revision,self.start,self.rows.len(),self.more,self.projection.freshness),"warnings":warnings.into_iter().take(100).collect::<Vec<_>>()}),
        )
    }
}
