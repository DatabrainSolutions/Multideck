using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBillingEventQueue
{
    public Guid? WmsbillEventId { get; set; }

    public Guid? WmsbillEventFacilityId { get; set; }

    public string? WmsfacilityName { get; set; }

    public Guid? WmsbillEventCustomerOrgId { get; set; }

    public string? CustomerName { get; set; }

    public Guid? WmsbillEventOrderId { get; set; }

    public string? WmsorderOrderNumber { get; set; }

    public Guid? WmsbillEventJobId { get; set; }

    public string? WmsbillEventStatusCode { get; set; }

    public string? WmsbillEventEventTypeCode { get; set; }

    public DateOnly? WmsbillEventEventDate { get; set; }

    public string? WmsbillEventDescription { get; set; }

    public decimal? WmsbillEventQuantity { get; set; }

    public decimal? WmsbillEventUnitRate { get; set; }

    public decimal? WmsbillEventNetAmount { get; set; }

    public string? WmsbillEventCurrencyCode { get; set; }
}
