using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceSourceHealth
{
    public Guid? TcesourceId { get; set; }

    public string? TcesourceCode { get; set; }

    public string? TcesourceName { get; set; }

    public string? TcesourceSourceTypeCode { get; set; }

    public string? TcesourceListTypeCode { get; set; }

    public string? TcesourceStatusCode { get; set; }

    public bool? TcesourceIsOfficial { get; set; }

    public DateTime? TcesourceLastRefreshAt { get; set; }

    public DateTime? TcesourceNextRefreshAt { get; set; }

    public int? TcesourceActiveEntryCount { get; set; }

    public DateTime? TcesourceLastFileDownloadedAt { get; set; }

    public int? TcesourceLastErrorCount { get; set; }
}
