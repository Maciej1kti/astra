WITH projects AS (
  SELECT json_extract(value,'$.project_id') id, key rank FROM json_each(?1)
), ordering AS (
  SELECT json_extract(value,'$.project_id') project_id,
    json_extract(value,'$.card_id') card_id, key rank FROM json_each(?2)
), candidates AS (
  SELECT d.project_id, d.entity_id card_id, json_extract(d.metadata_json,'$.position') position
  FROM documents d INDEXED BY documents_focus_pins JOIN projects p ON p.id=d.project_id
  WHERE entity_type='card' AND json_extract(metadata_json,'$.pinned')=1
  UNION ALL
  SELECT o.project_id,o.card_id,NULL FROM ordering o JOIN projects p ON p.id=o.project_id
  WHERE NOT EXISTS(SELECT 1 FROM documents d WHERE d.project_id=o.project_id
    AND d.entity_id=o.card_id AND d.entity_type='card')
  AND (EXISTS(SELECT 1 FROM projection_pending WHERE project_id=o.project_id)
    OR EXISTS(SELECT 1 FROM projection_issues WHERE project_id=o.project_id
      AND path IN ('project.json', 'cards/' || o.card_id || '.json')))
), selected AS (
  SELECT c.project_id,c.card_id,c.position,COALESCE(o.rank,2147483647) order_rank,p.rank project_rank
  FROM candidates c JOIN projects p ON p.id=c.project_id
  LEFT JOIN ordering o ON o.project_id=c.project_id AND o.card_id=c.card_id
  ORDER BY order_rank,project_rank,c.position,c.card_id
  LIMIT ?3
)
SELECT s.project_id,s.card_id,d.source_hash,d.metadata_json,d.validity FROM selected s
LEFT JOIN documents d ON d.project_id=s.project_id AND d.entity_id=s.card_id AND d.entity_type='card'
ORDER BY s.order_rank,s.project_rank,s.position,s.card_id
