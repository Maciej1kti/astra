WITH candidates AS (
              SELECT project_id,entity_id,entity_type,title,'overdue' reason,json_extract(metadata_json,'$.schedule.end') date,0 weight
FROM documents d
WHERE entity_type='card'
AND json_extract(metadata_json,'$.schedule.end')<?1
AND {ACTIVE}
AND (?5 IS NULL
OR d.project_id=?5)
AND (?6 IS NULL OR {FOLDER}=?6)
UNION ALL SELECT project_id,entity_id,entity_type,title,'due_soon',json_extract(metadata_json,'$.schedule.end'),3
FROM documents d
WHERE entity_type='card'
AND json_extract(metadata_json,'$.schedule.end') BETWEEN ?1
AND ?2
AND {ACTIVE}
AND (?5 IS NULL
OR d.project_id=?5)
AND (?6 IS NULL OR {FOLDER}=?6)
UNION ALL SELECT project_id,entity_id,entity_type,title,'overdue',date(json_extract(metadata_json,'$.event.start'),'+' || json_extract(metadata_json,'$.event.duration_minutes') || ' minutes'),0
FROM documents d
WHERE entity_type='card'
AND datetime(json_extract(metadata_json,'$.event.start'),'+' || json_extract(metadata_json,'$.event.duration_minutes') || ' minutes')<=?7
AND {ACTIVE}
AND (?5 IS NULL OR d.project_id=?5)
AND (?6 IS NULL OR {FOLDER}=?6)
UNION ALL SELECT project_id,entity_id,entity_type,title,'due_soon',date(json_extract(metadata_json,'$.event.start')),3
FROM documents d
WHERE entity_type='card'
AND datetime(json_extract(metadata_json,'$.event.start'),'+' || json_extract(metadata_json,'$.event.duration_minutes') || ' minutes')>?7
AND date(json_extract(metadata_json,'$.event.start'))<=?2
AND {ACTIVE}
AND (?5 IS NULL OR d.project_id=?5)
AND (?6 IS NULL OR {FOLDER}=?6)
UNION ALL SELECT project_id,entity_id,entity_type,title,'overdue',json_extract(metadata_json,'$.due.date'),0
FROM documents d
WHERE entity_type='milestone'
AND json_extract(metadata_json,'$.due.date')<?1
AND {ACTIVE}
AND (?5 IS NULL
OR d.project_id=?5)
AND (?6 IS NULL OR {FOLDER}=?6)
UNION ALL SELECT project_id,entity_id,entity_type,title,'due_soon',json_extract(metadata_json,'$.due.date'),3
FROM documents d
WHERE entity_type='milestone'
AND json_extract(metadata_json,'$.due.date') BETWEEN ?1
AND ?2
AND {ACTIVE}
AND (?5 IS NULL
OR d.project_id=?5)
AND (?6 IS NULL OR {FOLDER}=?6)
UNION ALL SELECT project_id,entity_id,entity_type,title,'review',NULL,4
FROM documents d INDEXED BY documents_in_review
WHERE entity_type='card'
AND json_extract(metadata_json,'$.status')='review'
AND {ACTIVE}
AND (?5 IS NULL
OR d.project_id=?5)
AND (?6 IS NULL OR {FOLDER}=?6)
UNION ALL SELECT d.project_id,d.entity_id,d.entity_type,d.title,'decision_needed',NULL,1
FROM documents d INDEXED BY documents_decision_needed
WHERE entity_type='update'
AND json_extract(metadata_json,'$.kind')='decision_needed'
AND {ACTIVE}
AND (?5 IS NULL
OR d.project_id=?5)
AND (?6 IS NULL OR {FOLDER}=?6)
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
-- Unread rows have the same weight, date and reason. Later rows cannot enter this page.
UNION ALL SELECT * FROM (
SELECT d.project_id,d.entity_id,d.entity_type,d.title,'unread_report',NULL,2
FROM documents d
WHERE ?8=1 AND entity_type='update'
AND (d.project_id || ':' || d.entity_id) NOT IN (
SELECT value FROM json_each(?9) WHERE value IS NOT NULL
)
AND json_extract(metadata_json,'$.kind')!='decision_needed'
AND {ACTIVE}
AND (?5 IS NULL OR d.project_id=?5)
AND (?6 IS NULL OR {FOLDER}=?6)
ORDER BY d.project_id,d.entity_id
LIMIT ?10
)
            ) SELECT project_id,entity_id,entity_type,title,reason,date
FROM candidates
WHERE (?8=0 OR reason!='due_soon')
ORDER BY weight,date,project_id,entity_id,reason
LIMIT ?3
OFFSET ?4
