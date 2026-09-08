WITH candidates AS (
              SELECT project_id,entity_id,entity_type,title,'overdue' reason,json_extract(metadata_json,'$.due.date') date,0 weight
FROM documents d
WHERE {ACTIVE}
AND (?5 IS NULL
OR d.project_id=?5)
AND json_extract(metadata_json,'$.due.kind')='hard'
AND json_extract(metadata_json,'$.due.date')<?1
UNION ALL SELECT project_id,entity_id,entity_type,title,'due_soon',json_extract(metadata_json,'$.due.date'),3
FROM documents d
WHERE {ACTIVE}
AND (?5 IS NULL
OR d.project_id=?5)
AND json_extract(metadata_json,'$.due.kind')='hard'
AND json_extract(metadata_json,'$.due.date') BETWEEN ?1
AND ?2
UNION ALL SELECT project_id,entity_id,entity_type,title,'review_due',json_extract(metadata_json,'$.review_on'),2
FROM documents d
WHERE {ACTIVE}
AND (?5 IS NULL
OR d.project_id=?5)
AND json_extract(metadata_json,'$.review_on')<=?1
UNION ALL SELECT project_id,entity_id,entity_type,title,'blocked',NULL,1
FROM documents d
WHERE {ACTIVE}
AND (?5 IS NULL
OR d.project_id=?5)
AND entity_type='card'
AND json_type(metadata_json,'$.blocked')='object'
UNION ALL SELECT project_id,entity_id,entity_type,title,'review',NULL,4
FROM documents d
WHERE {ACTIVE}
AND (?5 IS NULL
OR d.project_id=?5)
AND entity_type='card'
AND json_extract(metadata_json,'$.status')='review'
UNION ALL SELECT d.project_id,d.entity_id,d.entity_type,d.title,'decision_needed',NULL,1
FROM documents d
WHERE {ACTIVE}
AND (?5 IS NULL
OR d.project_id=?5)
AND entity_type='update'
AND json_extract(metadata_json,'$.kind')='decision_needed'
AND NOT EXISTS(SELECT 1
FROM documents r
WHERE r.project_id=d.project_id
AND r.entity_type='update'
AND ((json_extract(r.metadata_json,'$.kind')='resolution'
AND EXISTS(SELECT 1
FROM json_each(r.metadata_json,'$.resolves') edge
WHERE edge.value=d.entity_id))
OR (json_extract(r.metadata_json,'$.kind')='correction'
AND json_extract(r.metadata_json,'$.supersedes')=d.entity_id)))
            ) SELECT project_id,entity_id,entity_type,title,reason,date
FROM candidates
ORDER BY weight,date,project_id,entity_id,reason
LIMIT ?3
OFFSET ?4
