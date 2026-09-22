WITH selected AS(SELECT *
FROM documents
WHERE (?1 IS NULL
OR project_id=?1)
AND COALESCE(json_extract(metadata_json,'$.archived'),0)=0), dates AS (
              SELECT project_id,entity_id,source_hash,title,'card_schedule' kind,json_extract(metadata_json,'$.schedule.start') start,json_extract(metadata_json,'$.schedule.end') end
FROM selected
WHERE entity_type='card'
UNION ALL SELECT project_id,entity_id,source_hash,title,'milestone_due',json_extract(metadata_json,'$.due.date'),json_extract(metadata_json,'$.due.date')
FROM selected
WHERE entity_type='milestone'
            ) SELECT project_id,entity_id,source_hash,title,kind,start,end
FROM dates
WHERE start<=?3
AND end>=?2
ORDER BY start,project_id,entity_id,kind
LIMIT ?4
OFFSET ?5
