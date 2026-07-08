using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbRenderedPage
{
    public Guid DocbrpId { get; set; }

    public Guid DocbrpRenderJobId { get; set; }

    public Guid? DocbrpGeneratedDocumentId { get; set; }

    public int DocbrpPageNo { get; set; }

    public int? DocbrpWidthPx { get; set; }

    public int? DocbrpHeightPx { get; set; }

    public string? DocbrpImageStorageBucket { get; set; }

    public string? DocbrpImageStoragePath { get; set; }

    public string? DocbrpImageMimeType { get; set; }

    public string DocbrpTextExtractJson { get; set; } = null!;

    public string? DocbrpVisualHashSha256 { get; set; }

    public string DocbrpMetadataJson { get; set; } = null!;

    public DateTime DocbrpCreatedAt { get; set; }

    public virtual DocbGeneratedDocument? DocbrpGeneratedDocument { get; set; }

    public virtual DocbRenderJob DocbrpRenderJob { get; set; } = null!;
}
