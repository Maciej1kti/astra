WITH selected AS MATERIALIZED (
    SELECT d.project_id, p.title project_name,
        json_extract(p.metadata_json,'$.state')='archived' project_archived,
        d.entity_id card_id, d.title card_title,
        COALESCE(json_extract(d.metadata_json,'$.archived'),0) card_archived,
        d.source_hash, counter.value counter
    FROM documents d
    JOIN documents p ON p.project_id=d.project_id AND p.entity_type='project'
    JOIN json_each(d.metadata_json,'$.counters') counter
    WHERE d.entity_type='card' AND d.validity='valid' AND p.validity='valid'
        AND (?1 IS NULL OR d.project_id=?1)
        AND (?4 OR (COALESCE(json_extract(d.metadata_json,'$.archived'),0)=0
            AND json_extract(p.metadata_json,'$.state')!='archived'
            AND json_extract(counter.value,'$.archived')=0))
    ORDER BY p.title COLLATE NOCASE, d.project_id, d.title COLLATE NOCASE,
        d.entity_id, counter.key
    LIMIT ?5 OFFSET ?6
)
SELECT project_id, project_name, project_archived, card_id, card_title,
    card_archived, source_hash,
    json_extract(counter,'$.id'), json_extract(counter,'$.name'),
    json_extract(counter,'$.unit'), json_extract(counter,'$.step'),
    json_extract(counter,'$.archived'),
    (SELECT json_group_object(key,value) FROM json_each(selected.counter,'$.values')
        WHERE key>=?2 AND key<=?3),
    json_extract(counter,'$.rate'),
    (SELECT COALESCE(SUM(value),0) FROM json_each(selected.counter,'$.values')),
    (SELECT COUNT(*) FROM json_each(selected.counter,'$.values')),
    (SELECT MIN(key) FROM json_each(selected.counter,'$.values'))
FROM selected
