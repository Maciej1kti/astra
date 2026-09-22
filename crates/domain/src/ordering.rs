use crate::DomainError;

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
