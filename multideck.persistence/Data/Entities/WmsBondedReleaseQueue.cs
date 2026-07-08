using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedReleaseQueue
{
    public Guid? WmsbondRemovalId { get; set; }

    public Guid? WmsbondRemovalFacilityId { get; set; }

    public string? WmsfacilityName { get; set; }

    public Guid? WmsbondRemovalOrderId { get; set; }

    public string? WmsorderOrderNumber { get; set; }

    public Guid? WmsbondRemovalJobId { get; set; }

    public string? WmsbondRemovalRemovalNumber { get; set; }

    public string? WmsbondRemovalRemovalTypeCode { get; set; }

    public string? WmsbondRemovalStatusCode { get; set; }

    public string? WmsbondRemovalDeclarationReference { get; set; }

    public string? WmsbondRemovalCustomsReleaseReference { get; set; }

    public bool? WmsbondRemovalRequiresFinanceRelease { get; set; }

    public bool? WmsbondRemovalRequiresComplianceRelease { get; set; }

    public int? LineCount { get; set; }

    public decimal? RemovalQuantity { get; set; }

    public decimal? DutyDueAmount { get; set; }

    public decimal? TaxDueAmount { get; set; }
}
