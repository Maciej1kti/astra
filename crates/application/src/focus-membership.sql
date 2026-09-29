WITH projects AS (
  SELECT json_extract(value,'$.project_id') id, key rank FROM json_each(?1)
), ordering AS (
  SELECT json_extract(value,'$.project_id') project_id,
    json_extract(value,'$.card_id') card_id, key rank FROM json_each(?2)
), candidates AS (
  SELECT d.project_id, d.entity_id card_id, json_extract(d.metadata_json,'$.position') position
  FROM documents d JOIN projects p ON p.id=d.project_id
  WHERE entity_type='card' AND json_extract(metadata_json,'$.pinned')=1
  UNION ALL
  SELECT o.project_id,o.card_id,NULL FROM ordering o JOIN projects p ON p.id=o.project_id
  WHERE NOT EXISTS(SELECT 1 FROM documents d WHERE d.project_id=o.project_id
    AND d.entity_id=o.card_id AND d.entity_type='card')
  AND (EXISTS(SELECT 1 FROM projection_pending WHERE project_id=o.project_id)
    OR EXISTS(SELECT 1 FROM projection_issues WHERE project_id=o.project_id
      AND path IN ('project.json', 'cards/' || o.card_id || '.json')))
)
SELECT c.project_id,c.card_id FROM candidates c
JOIN projects p ON p.id=c.project_id
LEFT JOIN ordering o ON o.project_id=c.project_id AND o.card_id=c.card_id
ORDER BY COALESCE(o.rank,2147483647),p.rank,c.position,c.card_id
LIMIT ?3
