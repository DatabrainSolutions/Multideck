using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsStorageRule
{
    public Guid WmsstorageRuleId { get; set; }

    public Guid? WmsstorageRuleContractId { get; set; }

    public Guid? WmsstorageRuleFacilityId { get; set; }

    public Guid? WmsstorageRuleZoneId { get; set; }

    public Guid? WmsstorageRuleItemId { get; set; }

    public string? WmsstorageRuleInventoryStatusCode { get; set; }

    public string? WmsstorageRuleCustomsStatusCode { get; set; }

    public string WmsstorageRuleBillingBasisCode { get; set; } = null!;

    public int WmsstorageRuleFreeDays { get; set; }

    public decimal WmsstorageRuleUnitRate { get; set; }

    public decimal WmsstorageRuleMinimumAmount { get; set; }

    public string WmsstorageRuleCurrencyCode { get; set; } = null!;

    public DateOnly WmsstorageRuleEffectiveFrom { get; set; }

    public DateOnly? WmsstorageRuleEffectiveTo { get; set; }

    public string WmsstorageRuleRulesJson { get; set; } = null!;

    public bool WmsstorageRuleIsActive { get; set; }

    public virtual SysWmsbillingBasis WmsstorageRuleBillingBasisCodeNavigation { get; set; } = null!;

    public virtual WmsServiceContract? WmsstorageRuleContract { get; set; }

    public virtual SysWmscustomsStatus? WmsstorageRuleCustomsStatusCodeNavigation { get; set; }

    public virtual WmsFacility? WmsstorageRuleFacility { get; set; }

    public virtual SysWmsinventoryStatus? WmsstorageRuleInventoryStatusCodeNavigation { get; set; }

    public virtual WmsItem? WmsstorageRuleItem { get; set; }

    public virtual WmsZone? WmsstorageRuleZone { get; set; }
}
