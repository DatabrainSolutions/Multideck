using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsbillingBasis
{
    public string WmsbillingBasisCode { get; set; } = null!;

    public string WmsbillingBasisName { get; set; } = null!;

    public string? WmsbillingBasisDescription { get; set; }

    public string? WmsbillingBasisDefaultUom { get; set; }

    public bool WmsbillingBasisIsActive { get; set; }

    public int WmsbillingBasisSortOrder { get; set; }

    public virtual ICollection<WmsBillingEvent> WmsBillingEvents { get; set; } = new List<WmsBillingEvent>();

    public virtual ICollection<WmsServiceContractLine> WmsServiceContractLines { get; set; } = new List<WmsServiceContractLine>();

    public virtual ICollection<WmsStorageRule> WmsStorageRules { get; set; } = new List<WmsStorageRule>();
}
