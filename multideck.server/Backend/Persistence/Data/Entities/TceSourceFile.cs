using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceSourceFile
{
    public Guid TcesourceFileId { get; set; }

    public Guid TcesourceFileSourceId { get; set; }

    public string? TcesourceFileFileName { get; set; }

    public string? TcesourceFileFileUrl { get; set; }

    public string? TcesourceFileFileHash { get; set; }

    public string? TcesourceFileSourceVersion { get; set; }

    public DateTime? TcesourceFilePublishedAt { get; set; }

    public DateTime TcesourceFileDownloadedAt { get; set; }

    public string TcesourceFileImportStatusCode { get; set; } = null!;

    public int TcesourceFileRowCount { get; set; }

    public int TcesourceFileImportedRowCount { get; set; }

    public int TcesourceFileErrorCount { get; set; }

    public string TcesourceFileMetadataJson { get; set; } = null!;

    public DateTime TcesourceFileCreatedAt { get; set; }

    public virtual ICollection<TceWatchlistEntry> TceWatchlistEntries { get; set; } = new List<TceWatchlistEntry>();

    public virtual TceDataSource TcesourceFileSource { get; set; } = null!;
}
