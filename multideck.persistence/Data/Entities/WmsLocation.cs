using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsLocation
{
    public Guid WmslocationId { get; set; }

    public Guid WmslocationFacilityId { get; set; }

    public Guid? WmslocationZoneId { get; set; }

    public string WmslocationCode { get; set; } = null!;

    public string? WmslocationBarcode { get; set; }

    public string WmslocationTypeCode { get; set; } = null!;

    public string WmslocationStatusCode { get; set; } = null!;

    public string? WmslocationAisle { get; set; }

    public string? WmslocationBay { get; set; }

    public string? WmslocationLevel { get; set; }

    public string? WmslocationPosition { get; set; }

    public decimal? WmslocationLengthM { get; set; }

    public decimal? WmslocationWidthM { get; set; }

    public decimal? WmslocationHeightM { get; set; }

    public decimal? WmslocationMaxWeightKg { get; set; }

    public decimal? WmslocationMaxVolumeCbm { get; set; }

    public decimal? WmslocationTemperatureMinC { get; set; }

    public decimal? WmslocationTemperatureMaxC { get; set; }

    public bool WmslocationAllowsMultiSku { get; set; }

    public bool WmslocationAllowsBondedStock { get; set; }

    public string WmslocationAllowedCustomsStatusesJson { get; set; } = null!;

    public bool WmslocationIsActive { get; set; }

    public DateTime WmslocationCreatedAt { get; set; }

    public Guid? WmslocationCreatedBy { get; set; }

    public DateTime WmslocationUpdatedAt { get; set; }

    public bool WmslocationIsDeleted { get; set; }

    public virtual ICollection<WmsBondedAuthorisationSite> WmsBondedAuthorisationSites { get; set; } = new List<WmsBondedAuthorisationSite>();

    public virtual ICollection<WmsBondedMovement> WmsBondedMovementWmsbondMoveFromLocations { get; set; } = new List<WmsBondedMovement>();

    public virtual ICollection<WmsBondedMovement> WmsBondedMovementWmsbondMoveToLocations { get; set; } = new List<WmsBondedMovement>();

    public virtual ICollection<WmsCycleCountLine> WmsCycleCountLines { get; set; } = new List<WmsCycleCountLine>();

    public virtual ICollection<WmsDock> WmsDocks { get; set; } = new List<WmsDock>();

    public virtual ICollection<WmsHandlingUnitEvent> WmsHandlingUnitEvents { get; set; } = new List<WmsHandlingUnitEvent>();

    public virtual ICollection<WmsHandlingUnit> WmsHandlingUnits { get; set; } = new List<WmsHandlingUnit>();

    public virtual ICollection<WmsInventoryBalance> WmsInventoryBalances { get; set; } = new List<WmsInventoryBalance>();

    public virtual ICollection<WmsInventorySerial> WmsInventorySerials { get; set; } = new List<WmsInventorySerial>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactionWmstransactionFromLocations { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactionWmstransactionToLocations { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsOrderLine> WmsOrderLineWmsorderLineSourceLocations { get; set; } = new List<WmsOrderLine>();

    public virtual ICollection<WmsOrderLine> WmsOrderLineWmsorderLineTargetLocations { get; set; } = new List<WmsOrderLine>();

    public virtual ICollection<WmsPickTask> WmsPickTaskWmspickSourceLocations { get; set; } = new List<WmsPickTask>();

    public virtual ICollection<WmsPickTask> WmsPickTaskWmspickTargetLocations { get; set; } = new List<WmsPickTask>();

    public virtual ICollection<WmsReceiptLine> WmsReceiptLines { get; set; } = new List<WmsReceiptLine>();

    public virtual ICollection<WmsReceipt> WmsReceipts { get; set; } = new List<WmsReceipt>();

    public virtual ICollection<WmsScanEvent> WmsScanEvents { get; set; } = new List<WmsScanEvent>();

    public virtual ICollection<WmsTask> WmsTaskWmstaskSourceLocations { get; set; } = new List<WmsTask>();

    public virtual ICollection<WmsTask> WmsTaskWmstaskTargetLocations { get; set; } = new List<WmsTask>();

    public virtual CmpUser? WmslocationCreatedByNavigation { get; set; }

    public virtual WmsFacility WmslocationFacility { get; set; } = null!;

    public virtual SysWmslocationStatus WmslocationStatusCodeNavigation { get; set; } = null!;

    public virtual SysWmslocationType WmslocationTypeCodeNavigation { get; set; } = null!;

    public virtual WmsZone? WmslocationZone { get; set; }
}
