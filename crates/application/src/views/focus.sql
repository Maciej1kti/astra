SELECT project_id,entity_id,source_hash,metadata_json,validity
FROM documents d
WHERE entity_type='card' AND {ACTIVE}
AND COALESCE(json_extract(metadata_json,'$.pinned'),0)=0
AND json_extract(metadata_json,'$.status')!='review'
AND (?2 IS NULL OR {FOLDER}=?2)
AND (
  (?1='motion' AND json_extract(metadata_json,'$.schedule.start')<=?3
    AND json_extract(metadata_json,'$.schedule.end')>=?3)
  OR
  (?1='events' AND date(json_extract(metadata_json,'$.event.start'))=?3
    AND datetime(json_extract(metadata_json,'$.event.start'),
      '+' || json_extract(metadata_json,'$.event.duration_minutes') || ' minutes')>?4)
)
ORDER BY CASE WHEN ?1='events' THEN json_extract(metadata_json,'$.event.start') END,
COALESCE(json_extract(metadata_json,'$.position'),title),entity_id,project_id
LIMIT ?5 OFFSET ?6
