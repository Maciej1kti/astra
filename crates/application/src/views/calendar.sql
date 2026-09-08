WITH selected AS(SELECT *
FROM documents
WHERE (?1 IS NULL
OR project_id=?1)
AND COALESCE(json_extract(metadata_json,'$.archived'),0)=0), dates AS (
              SELECT project_id,entity_id,source_hash,title,'card_schedule' kind,json_extract(metadata_json,'$.schedule.start') start,json_extract(metadata_json,'$.schedule.end') end,NULL due_kind
FROM selected
WHERE entity_type='card'
UNION ALL SELECT project_id,entity_id,source_hash,title,'card_due',json_extract(metadata_json,'$.due.date'),json_extract(metadata_json,'$.due.date'),json_extract(metadata_json,'$.due.kind')
FROM selected
WHERE entity_type='card'
UNION ALL SELECT project_id,entity_id,source_hash,title,'milestone_due',json_extract(metadata_json,'$.due.date'),json_extract(metadata_json,'$.due.date'),json_extract(metadata_json,'$.due.kind')
FROM selected
WHERE entity_type='milestone'
UNION ALL SELECT project_id,entity_id,source_hash,title,CASE WHEN entity_type='project' THEN 'project_review' ELSE 'card_review' END,json_extract(metadata_json,'$.review_on'),json_extract(metadata_json,'$.review_on'),NULL
FROM selected
WHERE entity_type IN ('project','card')
            ) SELECT project_id,entity_id,source_hash,title,kind,start,end,due_kind
FROM dates
WHERE start<=?3
AND end>=?2
ORDER BY start,project_id,entity_id,kind
LIMIT ?4
OFFSET ?5
