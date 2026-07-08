using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlVersion
{
    public Guid BlvId { get; set; }

    public Guid BlvBlId { get; set; }

    public int BlvVersionNo { get; set; }

    public string BlvStatus { get; set; } = null!;

    public string? BlvChangeReason { get; set; }

    public string BlvEfblpayload { get; set; } = null!;

    public string? BlvRenderedTextSnapshot { get; set; }

    public string? BlvPdfSha256 { get; set; }

    public DateTime BlvCreatedAt { get; set; }

    public Guid? BlvCreatedBy { get; set; }

    public virtual BlHeader BlvBl { get; set; } = null!;

    public virtual SysBldocumentStatus BlvStatusNavigation { get; set; } = null!;
}
