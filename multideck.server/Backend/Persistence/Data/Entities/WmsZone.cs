using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsZone
{
    public Guid WmszoneId { get; set; }

    public Guid WmszoneFacilityId { get; set; }

    public string WmszoneCode { get; set; } = null!;

    public string WmszoneName { get; set; } = null!;

    public string WmszoneTypeCode { get; set; } = null!;

    public string WmszoneStatusCode { get; set; } = null!;

    public bool WmszoneAllowsBondedStock { get; set; }

    public bool WmszoneAllowsCustomsControlledStock { get; set; }

    public decimal? WmszoneTemperatureMinC { get; set; }

    public decimal? WmszoneTemperatureMaxC { get; set; }

    public string WmszoneSettingsJson { get; set; } = null!;

    public bool WmszoneIsActive { get; set; }

    public DateTime WmszoneCreatedAt { get; set; }

    public Guid? WmszoneCreatedBy { get; set; }

    public DateTime WmszoneUpdatedAt { get; set; }

    public bool WmszoneIsDeleted { get; set; }

    public virtual ICollection<WmsBondedAuthorisationSite> WmsBondedAuthorisationSites { get; set; } = new List<WmsBondedAuthorisationSite>();

    public virtual ICollection<WmsCycleCountPlan> WmsCycleCountPlans { get; set; } = new List<WmsCycleCountPlan>();

    public virtual ICollection<WmsLocation> WmsLocations { get; set; } = new List<WmsLocation>();

    public virtual ICollection<WmsStorageRule> WmsStorageRules { get; set; } = new List<WmsStorageRule>();

    public virtual CmpUser? WmszoneCreatedByNavigation { get; set; }

    public virtual WmsFacility WmszoneFacility { get; set; } = null!;

    public virtual SysWmslocationStatus WmszoneStatusCodeNavigation { get; set; } = null!;

    public virtual SysWmszoneType WmszoneTypeCodeNavigation { get; set; } = null!;
}
