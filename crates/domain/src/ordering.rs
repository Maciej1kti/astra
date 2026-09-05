use crate::DomainError;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Position(u128);
impl Position {
    pub fn parse(text: &str) -> Result<Self, DomainError> {
        if text.len() != 32
            || !text
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(DomainError::Invalid("rank syntax"));
        }
        let rank =
            u128::from_str_radix(text, 16).map_err(|_| DomainError::Invalid("rank overflow"))?;
        if rank == 0 || rank == u128::MAX {
            return Err(DomainError::Invalid("reserved rank"));
        }
        Ok(Self(rank))
    }
    pub fn between(low: Option<Self>, high: Option<Self>) -> Result<Self, DomainError> {
        let (low, high) = (low.map_or(0, |r| r.0), high.map_or(u128::MAX, |r| r.0));
        if low >= high {
            return Err(DomainError::Invalid("ORDER_CHANGED"));
        }
        if high - low <= 1 {
            return Err(DomainError::Invalid("ORDER_REBALANCE_REQUIRED"));
        }
        Ok(Self(low + (high - low) / 2))
    }
}
impl std::fmt::Display for Position {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:032x}", self.0)
    }
}

/// Validate a complete project's dependency graph, including hidden cards.
/// Iterative traversal avoids stack exhaustion on a long dependency chain.
pub fn validate_dependencies(graph: &BTreeMap<String, Vec<String>>) -> Result<(), DomainError> {
    let mut degrees: BTreeMap<&str, usize> = graph.keys().map(|id| (id.as_str(), 0)).collect();
    let mut successors: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for (id, dependencies) in graph {
        if dependencies.len() > 100 {
            return Err(DomainError::Invalid("too many dependencies"));
        }
        let mut seen = BTreeSet::new();
        for dependency in dependencies {
            if dependency == id || !seen.insert(dependency) {
                return Err(DomainError::Invalid("self or duplicate dependency"));
            }
            if !graph.contains_key(dependency) {
                return Err(DomainError::Invalid("broken dependency"));
            }
            *degrees.get_mut(id.as_str()).unwrap() += 1;
            successors.entry(dependency).or_default().push(id);
        }
    }
    let mut queue: VecDeque<_> = degrees
        .iter()
        .filter_map(|(id, count)| (*count == 0).then_some(*id))
        .collect();
    let mut visited = 0;
    while let Some(id) = queue.pop_front() {
        visited += 1;
        if let Some(next) = successors.get(id) {
            for target in next {
                let count = degrees.get_mut(target).unwrap();
                *count -= 1;
                if *count == 0 {
                    queue.push_back(target);
                }
            }
        }
    }
    if visited != graph.len() {
        return Err(DomainError::Invalid("dependency cycle"));
    }
    Ok(())
}
