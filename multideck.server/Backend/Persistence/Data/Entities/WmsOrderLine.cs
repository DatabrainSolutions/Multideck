using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsOrderLine
{
    public Guid WmsorderLineId { get; set; }

    public Guid WmsorderLineOrderId { get; set; }

    public int WmsorderLineLineNo { get; set; }

    public Guid WmsorderLineItemId { get; set; }

    public Guid? WmsorderLineSourceJobCargoId { get; set; }

    public Guid? WmsorderLineSourceJobEquipmentId { get; set; }

    public string WmsorderLineStatusCode { get; set; } = null!;

    public decimal WmsorderLineOrderedQuantity { get; set; }

    public decimal WmsorderLineReceivedQuantity { get; set; }

    public decimal WmsorderLineAllocatedQuantity { get; set; }

    public decimal WmsorderLinePickedQuantity { get; set; }

    public decimal WmsorderLinePackedQuantity { get; set; }

    public decimal WmsorderLineDispatchedQuantity { get; set; }

    public string WmsorderLineUomcode { get; set; } = null!;

    public string? WmsorderLineLotNumber { get; set; }

    public string? WmsorderLineSerialNumber { get; set; }

    public DateOnly? WmsorderLineExpiryDate { get; set; }

    public Guid? WmsorderLineSourceLocationId { get; set; }

    public Guid? WmsorderLineTargetLocationId { get; set; }

    public string WmsorderLineInventoryStatusCode { get; set; } = null!;

    public string WmsorderLineCustomsStatusCode { get; set; } = null!;

    public decimal? WmsorderLineGoodsValue { get; set; }

    public string? WmsorderLineCurrencyCode { get; set; }

    public string? WmsorderLineInstructions { get; set; }

    public string WmsorderLineMetadataJson { get; set; } = null!;

    public DateTime WmsorderLineCreatedAt { get; set; }

    public virtual ICollection<WmsBondedEntryLine> WmsBondedEntryLines { get; set; } = new List<WmsBondedEntryLine>();

    public virtual ICollection<WmsBondedRemovalLine> WmsBondedRemovalLines { get; set; } = new List<WmsBondedRemovalLine>();

    public virtual ICollection<WmsException> WmsExceptions { get; set; } = new List<WmsException>();

    public virtual ICollection<WmsInboundAdviceLine> WmsInboundAdviceLines { get; set; } = new List<WmsInboundAdviceLine>();

    public virtual ICollection<WmsInventoryAllocation> WmsInventoryAllocations { get; set; } = new List<WmsInventoryAllocation>();

    public virtual ICollection<WmsInventoryReservation> WmsInventoryReservations { get; set; } = new List<WmsInventoryReservation>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsPickTask> WmsPickTasks { get; set; } = new List<WmsPickTask>();

    public virtual ICollection<WmsReceiptLine> WmsReceiptLines { get; set; } = new List<WmsReceiptLine>();

    public virtual ICollection<WmsTask> WmsTasks { get; set; } = new List<WmsTask>();

    public virtual SysWmscustomsStatus WmsorderLineCustomsStatusCodeNavigation { get; set; } = null!;

    public virtual SysWmsinventoryStatus WmsorderLineInventoryStatusCodeNavigation { get; set; } = null!;

    public virtual WmsItem WmsorderLineItem { get; set; } = null!;

    public virtual WmsOrder WmsorderLineOrder { get; set; } = null!;

    public virtual WmsLocation? WmsorderLineSourceLocation { get; set; }

    public virtual SysWmsorderLineStatus WmsorderLineStatusCodeNavigation { get; set; } = null!;

    public virtual WmsLocation? WmsorderLineTargetLocation { get; set; }
}
