namespace multideck.shared.Pagination;
public sealed record PaginationFilter
{
    private const int MinLimit = 0;
    private const int MaxLimit = 1000;

    private const int MinPage = 1;

    public PaginationFilter(int limit, int page)
    {
        Limit = Math.Clamp(limit, MinLimit, MaxLimit);
        Page = Math.Max(page, MinPage);
    }

    public int Limit { get; }
    public int Page { get; }
    public int Offset => Limit * (Page - 1);
}