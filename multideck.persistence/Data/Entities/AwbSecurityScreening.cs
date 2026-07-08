using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Air cargo security screening status and regulated-agent snapshots for AWB/e-AWB handling.
/// </summary>
public partial class AwbSecurityScreening
{
    public Guid AwbssId { get; set; }

    public Guid AwbssAwbid { get; set; }

    public Guid? AwbssGoodsItemId { get; set; }

    public string? AwbssSecurityStatus { get; set; }

    public string? AwbssScreeningMethod { get; set; }

    public Guid? AwbssScreenedByOrgId { get; set; }

    public string? AwbssScreenedByNameSnapshot { get; set; }

    public string? AwbssRegulatedAgentNumberSnapshot { get; set; }

    public DateTime? AwbssScreeningDateTime { get; set; }

    public string? AwbssExemptionCode { get; set; }

    public string? AwbssExemptionReason { get; set; }

    public string? AwbssNotes { get; set; }

    public DateTime AwbssCreatedAt { get; set; }

    public virtual AwbHeader AwbssAwb { get; set; } = null!;

    public virtual AwbGoodsItem? AwbssGoodsItem { get; set; }
}
