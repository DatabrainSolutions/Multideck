using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsHandlingUnit
{
    public Guid WmshuId { get; set; }

    public Guid WmshuFacilityId { get; set; }

    public Guid? WmshuParentHuId { get; set; }

    public string WmshuTypeCode { get; set; } = null!;

    public string WmshuCode { get; set; } = null!;

    public string? WmshuSscc { get; set; }

    public string? WmshuExternalReference { get; set; }

    public Guid? WmshuCustomerOrgId { get; set; }

    public Guid? WmshuJobId { get; set; }

    public Guid? WmshuOrderId { get; set; }

    public Guid? WmshuLocationId { get; set; }

    public string WmshuInventoryStatusCode { get; set; } = null!;

    public string WmshuCustomsStatusCode { get; set; } = null!;

    public decimal? WmshuGrossWeightKg { get; set; }

    public decimal? WmshuNetWeightKg { get; set; }

    public decimal? WmshuVolumeCbm { get; set; }

    public string? WmshuSealNumber { get; set; }

    public bool WmshuIsSealed { get; set; }

    public DateTime WmshuCreatedAt { get; set; }

    public Guid? WmshuCreatedBy { get; set; }

    public DateTime WmshuUpdatedAt { get; set; }

    public bool WmshuIsDeleted { get; set; }

    public virtual ICollection<WmsHandlingUnit> InverseWmshuParentHu { get; set; } = new List<WmsHandlingUnit>();

    public virtual ICollection<WmsBondedInventoryLink> WmsBondedInventoryLinks { get; set; } = new List<WmsBondedInventoryLink>();

    public virtual ICollection<WmsHandlingUnitContent> WmsHandlingUnitContents { get; set; } = new List<WmsHandlingUnitContent>();

    public virtual ICollection<WmsHandlingUnitEvent> WmsHandlingUnitEvents { get; set; } = new List<WmsHandlingUnitEvent>();

    public virtual ICollection<WmsInventoryBalance> WmsInventoryBalances { get; set; } = new List<WmsInventoryBalance>();

    public virtual ICollection<WmsInventoryHold> WmsInventoryHolds { get; set; } = new List<WmsInventoryHold>();

    public virtual ICollection<WmsInventorySerial> WmsInventorySerials { get; set; } = new List<WmsInventorySerial>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsPackTask> WmsPackTasks { get; set; } = new List<WmsPackTask>();

    public virtual ICollection<WmsPackage> WmsPackages { get; set; } = new List<WmsPackage>();

    public virtual ICollection<WmsReceiptLine> WmsReceiptLines { get; set; } = new List<WmsReceiptLine>();

    public virtual ICollection<WmsScanEvent> WmsScanEvents { get; set; } = new List<WmsScanEvent>();

    public virtual ICollection<WmsTask> WmsTasks { get; set; } = new List<WmsTask>();

    public virtual CmpUser? WmshuCreatedByNavigation { get; set; }

    public virtual OrgMaster? WmshuCustomerOrg { get; set; }

    public virtual SysWmscustomsStatus WmshuCustomsStatusCodeNavigation { get; set; } = null!;

    public virtual WmsFacility WmshuFacility { get; set; } = null!;

    public virtual SysWmsinventoryStatus WmshuInventoryStatusCodeNavigation { get; set; } = null!;

    public virtual JobHeader? WmshuJob { get; set; }

    public virtual WmsLocation? WmshuLocation { get; set; }

    public virtual WmsOrder? WmshuOrder { get; set; }

    public virtual WmsHandlingUnit? WmshuParentHu { get; set; }

    public virtual SysWmshandlingUnitType WmshuTypeCodeNavigation { get; set; } = null!;
}
