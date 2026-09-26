WITH selected AS(SELECT *
FROM documents
WHERE (?1 IS NULL
OR project_id=?1)
AND COALESCE(json_extract(metadata_json,'$.archived'),0)=0), dates AS (
              SELECT project_id,entity_id,source_hash,title,'card_schedule' kind,json_extract(metadata_json,'$.schedule.start') start,json_extract(metadata_json,'$.schedule.end') end,NULL event
FROM selected
WHERE entity_type='card'
UNION ALL SELECT project_id,entity_id,source_hash,title,'card_event',substr(json_extract(metadata_json,'$.event.start'),1,10),date(json_extract(metadata_json,'$.event.start'),'+' || json_extract(metadata_json,'$.event.duration_minutes') || ' minutes','-1 second'),json_extract(metadata_json,'$.event')
FROM selected
WHERE entity_type='card' AND json_type(metadata_json,'$.event')='object'
UNION ALL SELECT project_id,entity_id,source_hash,title,'milestone_due',json_extract(metadata_json,'$.due.date'),json_extract(metadata_json,'$.due.date'),NULL
FROM selected
WHERE entity_type='milestone'
            ) SELECT project_id,entity_id,source_hash,title,kind,start,end,event
FROM dates
WHERE start<=?3
AND end>=?2
ORDER BY start,COALESCE(json_extract(event,'$.start'),start),project_id,entity_id,kind
LIMIT ?4
OFFSET ?5
