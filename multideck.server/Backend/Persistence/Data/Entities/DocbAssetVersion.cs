using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbAssetVersion
{
    public Guid DocbavId { get; set; }

    public Guid DocbavAssetId { get; set; }

    public int DocbavVersionNo { get; set; }

    public string? DocbavFileName { get; set; }

    public string? DocbavStorageBucket { get; set; }

    public string? DocbavStoragePath { get; set; }

    public string? DocbavFileUrl { get; set; }

    public string? DocbavMimeType { get; set; }

    public long? DocbavFileSizeBytes { get; set; }

    public string? DocbavSha256 { get; set; }

    public int? DocbavWidthPx { get; set; }

    public int? DocbavHeightPx { get; set; }

    public int? DocbavDpi { get; set; }

    public bool DocbavIsCurrent { get; set; }

    public string? DocbavChangeReason { get; set; }

    public DateTime DocbavCreatedAt { get; set; }

    public Guid? DocbavCreatedBy { get; set; }

    public virtual DocbAssetLibrary DocbavAsset { get; set; } = null!;

    public virtual CmpUser? DocbavCreatedByNavigation { get; set; }
}
