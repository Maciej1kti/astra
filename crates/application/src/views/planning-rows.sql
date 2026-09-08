SELECT entity_id,
    source_hash,
    metadata_json,
    validity,
    entity_type
FROM documents
WHERE project_id=?1
AND (entity_type='card'
OR (?5
AND entity_type='milestone'))
AND (?2 IS NULL
OR json_extract(metadata_json,
    '$.status')=?2)
AND COALESCE(json_extract(metadata_json,
    '$.archived'),
    0)=0
ORDER BY entity_type,
    json_extract(metadata_json,
    '$.status'),
    json_extract(metadata_json,
    '$.position'),
    entity_id
LIMIT ?3
OFFSET ?4
