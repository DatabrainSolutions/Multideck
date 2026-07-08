using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInventoryBalance
{
    public Guid WmsbalanceId { get; set; }

    public Guid WmsbalanceFacilityId { get; set; }

    public Guid? WmsbalanceCustomerOrgId { get; set; }

    public Guid WmsbalanceItemId { get; set; }

    public Guid? WmsbalanceLocationId { get; set; }

    public Guid? WmsbalanceLotId { get; set; }

    public Guid? WmsbalanceSerialId { get; set; }

    public Guid? WmsbalanceHuId { get; set; }

    public string WmsbalanceInventoryStatusCode { get; set; } = null!;

    public string WmsbalanceCustomsStatusCode { get; set; } = null!;

    public string WmsbalanceUomcode { get; set; } = null!;

    public decimal WmsbalanceOnHandQuantity { get; set; }

    public decimal WmsbalanceReservedQuantity { get; set; }

    public decimal WmsbalanceAllocatedQuantity { get; set; }

    public decimal WmsbalanceHeldQuantity { get; set; }

    public decimal WmsbalanceAvailableQuantity { get; set; }

    public DateTime? WmsbalanceFirstReceiptAt { get; set; }

    public DateTime? WmsbalanceLastMovementAt { get; set; }

    public bool WmsbalanceIsBonded { get; set; }

    public string? WmsbalanceCustomsEntryReference { get; set; }

    public decimal? WmsbalanceStockValue { get; set; }

    public string? WmsbalanceCurrencyCode { get; set; }

    public string WmsbalanceMetadataJson { get; set; } = null!;

    public DateTime WmsbalanceCreatedAt { get; set; }

    public DateTime WmsbalanceUpdatedAt { get; set; }

    public virtual ICollection<WmsAdjustmentLine> WmsAdjustmentLines { get; set; } = new List<WmsAdjustmentLine>();

    public virtual ICollection<WmsAiinsight> WmsAiinsights { get; set; } = new List<WmsAiinsight>();

    public virtual ICollection<WmsBondedDiscrepancy> WmsBondedDiscrepancies { get; set; } = new List<WmsBondedDiscrepancy>();

    public virtual ICollection<WmsBondedInventoryLink> WmsBondedInventoryLinks { get; set; } = new List<WmsBondedInventoryLink>();

    public virtual ICollection<WmsBondedMovement> WmsBondedMovements { get; set; } = new List<WmsBondedMovement>();

    public virtual ICollection<WmsBondedRemovalLine> WmsBondedRemovalLines { get; set; } = new List<WmsBondedRemovalLine>();

    public virtual ICollection<WmsCycleCountLine> WmsCycleCountLines { get; set; } = new List<WmsCycleCountLine>();

    public virtual ICollection<WmsException> WmsExceptions { get; set; } = new List<WmsException>();

    public virtual ICollection<WmsInventoryAllocation> WmsInventoryAllocations { get; set; } = new List<WmsInventoryAllocation>();

    public virtual ICollection<WmsInventoryHold> WmsInventoryHolds { get; set; } = new List<WmsInventoryHold>();

    public virtual ICollection<WmsInventoryReservation> WmsInventoryReservations { get; set; } = new List<WmsInventoryReservation>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsPickTask> WmsPickTasks { get; set; } = new List<WmsPickTask>();

    public virtual ICollection<WmsTask> WmsTasks { get; set; } = new List<WmsTask>();

    public virtual OrgMaster? WmsbalanceCustomerOrg { get; set; }

    public virtual SysWmscustomsStatus WmsbalanceCustomsStatusCodeNavigation { get; set; } = null!;

    public virtual WmsFacility WmsbalanceFacility { get; set; } = null!;

    public virtual WmsHandlingUnit? WmsbalanceHu { get; set; }

    public virtual SysWmsinventoryStatus WmsbalanceInventoryStatusCodeNavigation { get; set; } = null!;

    public virtual WmsItem WmsbalanceItem { get; set; } = null!;

    public virtual WmsLocation? WmsbalanceLocation { get; set; }

    public virtual WmsInventoryLot? WmsbalanceLot { get; set; }

    public virtual WmsInventorySerial? WmsbalanceSerial { get; set; }
}
