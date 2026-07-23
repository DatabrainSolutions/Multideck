using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedStockSummary
{
    public Guid? WmsbondInvLinkId { get; set; }

    public Guid? WmsbondEntryId { get; set; }

    public string? WmsbondEntryEntryReference { get; set; }

    public string? WmsbondEntryDeclarationReference { get; set; }

    public string? WmsbondEntryProcedureTypeCode { get; set; }

    public string? WmsbondEntryStatusCode { get; set; }

    public Guid? WmsbondEntryLineId { get; set; }

    public string? WmsbondEntryLineHscode { get; set; }

    public string? WmsbondEntryLineCountryOfOriginCode { get; set; }

    public Guid? WmsbalanceId { get; set; }

    public Guid? WmsbalanceFacilityId { get; set; }

    public string? WmsfacilityName { get; set; }

    public Guid? WmsbalanceCustomerOrgId { get; set; }

    public string? CustomerName { get; set; }

    public string? WmsitemSku { get; set; }

    public string? WmsitemDescription { get; set; }

    public Guid? WmsbalanceLocationId { get; set; }

    public string? WmslocationCode { get; set; }

    public decimal? WmsbondInvLinkLinkedQuantity { get; set; }

    public decimal? WmsbondInvLinkRemainingQuantity { get; set; }

    public decimal? WmsbalanceOnHandQuantity { get; set; }

    public decimal? WmsbalanceHeldQuantity { get; set; }

    public decimal? WmsbalanceAvailableQuantity { get; set; }

    public decimal? WmsbondEntryTotalDutyEstimate { get; set; }

    public decimal? WmsbondEntryTotalTaxEstimate { get; set; }

    public string? WmsbondEntryCurrencyCode { get; set; }
}
