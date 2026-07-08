using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDigitalRecordLink
{
    public Guid FindigLinkId { get; set; }

    public string FindigLinkSourceTable { get; set; } = null!;

    public Guid FindigLinkSourceId { get; set; }

    public string FindigLinkTargetTable { get; set; } = null!;

    public Guid FindigLinkTargetId { get; set; }

    public string FindigLinkLinkTypeCode { get; set; } = null!;

    public string? FindigLinkHashSha256 { get; set; }

    public DateTime FindigLinkCreatedAt { get; set; }
}
