using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBillingEvent
{
    public Guid WmsbillEventId { get; set; }

    public Guid WmsbillEventFacilityId { get; set; }

    public Guid WmsbillEventCustomerOrgId { get; set; }

    public Guid? WmsbillEventContractId { get; set; }

    public Guid? WmsbillEventOrderId { get; set; }

    public Guid? WmsbillEventJobId { get; set; }

    public string WmsbillEventStatusCode { get; set; } = null!;

    public string WmsbillEventEventTypeCode { get; set; } = null!;

    public DateOnly WmsbillEventEventDate { get; set; }

    public string WmsbillEventDescription { get; set; } = null!;

    public string WmsbillEventBillingBasisCode { get; set; } = null!;

    public decimal WmsbillEventQuantity { get; set; }

    public decimal WmsbillEventUnitRate { get; set; }

    public decimal WmsbillEventNetAmount { get; set; }

    public string WmsbillEventCurrencyCode { get; set; } = null!;

    public Guid? WmsbillEventFindocumentLineId { get; set; }

    public Guid? WmsbillEventRateResultId { get; set; }

    public string WmsbillEventMetadataJson { get; set; } = null!;

    public DateTime WmsbillEventCreatedAt { get; set; }

    public Guid? WmsbillEventCreatedBy { get; set; }

    public virtual ICollection<WmsBillingEventLine> WmsBillingEventLines { get; set; } = new List<WmsBillingEventLine>();

    public virtual SysWmsbillingBasis WmsbillEventBillingBasisCodeNavigation { get; set; } = null!;

    public virtual WmsServiceContract? WmsbillEventContract { get; set; }

    public virtual CmpUser? WmsbillEventCreatedByNavigation { get; set; }

    public virtual OrgMaster WmsbillEventCustomerOrg { get; set; } = null!;

    public virtual WmsFacility WmsbillEventFacility { get; set; } = null!;

    public virtual FinDocumentLine? WmsbillEventFindocumentLine { get; set; }

    public virtual JobHeader? WmsbillEventJob { get; set; }

    public virtual WmsOrder? WmsbillEventOrder { get; set; }

    public virtual RateRateResult? WmsbillEventRateResult { get; set; }

    public virtual SysWmsbillingStatus WmsbillEventStatusCodeNavigation { get; set; } = null!;
}
