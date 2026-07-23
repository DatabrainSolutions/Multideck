using multideck.shared.Pagination;

public sealed class PagedResult<T>
{
    public required T[] Items { get; init; }
    public int TotalPages => Limit > 0 ? (int)Math.Ceiling(TotalCount / (decimal)Limit) : 1;
    public required int TotalCount { get; init; }
    public required int Page { get; init; }
    public required int Limit { get; init; }
}

public static class PagingResultExtensions
{
    extension<T>(IEnumerable<T> items)
    {
        public PagedResult<T> ToPagedResult(PaginationFilter pagination, int totalCount)
        {
            return new PagedResult<T>
            {
                Items = items.ToArray(),
                TotalCount = totalCount,
                Page = pagination.Page,
                Limit = pagination.Limit
            };
        }
    }
}

