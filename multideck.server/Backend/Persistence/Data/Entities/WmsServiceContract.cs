using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsServiceContract
{
    public Guid WmscontractId { get; set; }

    public Guid WmscontractCustomerProfileId { get; set; }

    public Guid? WmscontractFacilityId { get; set; }

    public Guid? WmscontractRateContractId { get; set; }

    public string WmscontractCode { get; set; } = null!;

    public string WmscontractName { get; set; } = null!;

    public string WmscontractStatusCode { get; set; } = null!;

    public string WmscontractCurrencyCode { get; set; } = null!;

    public DateOnly WmscontractEffectiveFrom { get; set; }

    public DateOnly? WmscontractEffectiveTo { get; set; }

    public string WmscontractBillingCycleCode { get; set; } = null!;

    public string WmscontractRulesJson { get; set; } = null!;

    public DateTime WmscontractCreatedAt { get; set; }

    public Guid? WmscontractCreatedBy { get; set; }

    public virtual ICollection<WmsBillingEvent> WmsBillingEvents { get; set; } = new List<WmsBillingEvent>();

    public virtual ICollection<WmsServiceContractLine> WmsServiceContractLines { get; set; } = new List<WmsServiceContractLine>();

    public virtual ICollection<WmsStorageRule> WmsStorageRules { get; set; } = new List<WmsStorageRule>();

    public virtual CmpUser? WmscontractCreatedByNavigation { get; set; }

    public virtual WmsCustomerProfile WmscontractCustomerProfile { get; set; } = null!;

    public virtual WmsFacility? WmscontractFacility { get; set; }
}
