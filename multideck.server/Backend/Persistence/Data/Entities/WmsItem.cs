using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsItem
{
    public Guid WmsitemId { get; set; }

    public Guid WmsitemCustomerOrgId { get; set; }

    public Guid? WmsitemDefaultFacilityId { get; set; }

    public string WmsitemSku { get; set; } = null!;

    public string WmsitemDescription { get; set; } = null!;

    public string? WmsitemCommodityDescription { get; set; }

    public string? WmsitemHscode { get; set; }

    public string? WmsitemEccncode { get; set; }

    public string? WmsitemCountryOfOriginCode { get; set; }

    public string WmsitemBaseUomcode { get; set; } = null!;

    public decimal? WmsitemLengthM { get; set; }

    public decimal? WmsitemWidthM { get; set; }

    public decimal? WmsitemHeightM { get; set; }

    public decimal? WmsitemNetWeightKg { get; set; }

    public decimal? WmsitemGrossWeightKg { get; set; }

    public bool WmsitemIsDangerousGoods { get; set; }

    public bool WmsitemIsExciseGoods { get; set; }

    public bool WmsitemIsHighValue { get; set; }

    public bool WmsitemIsBondedEligible { get; set; }

    public bool WmsitemRequiresLot { get; set; }

    public bool WmsitemRequiresSerial { get; set; }

    public bool WmsitemRequiresExpiry { get; set; }

    public decimal? WmsitemTemperatureMinC { get; set; }

    public decimal? WmsitemTemperatureMaxC { get; set; }

    public string WmsitemComplianceJson { get; set; } = null!;

    public bool WmsitemIsActive { get; set; }

    public DateTime WmsitemCreatedAt { get; set; }

    public Guid? WmsitemCreatedBy { get; set; }

    public DateTime WmsitemUpdatedAt { get; set; }

    public bool WmsitemIsDeleted { get; set; }

    public virtual ICollection<WmsAdjustmentLine> WmsAdjustmentLines { get; set; } = new List<WmsAdjustmentLine>();

    public virtual ICollection<WmsBondedEntryLine> WmsBondedEntryLines { get; set; } = new List<WmsBondedEntryLine>();

    public virtual ICollection<WmsBondedEquivalenceRule> WmsBondedEquivalenceRules { get; set; } = new List<WmsBondedEquivalenceRule>();

    public virtual ICollection<WmsBondedRemovalLine> WmsBondedRemovalLines { get; set; } = new List<WmsBondedRemovalLine>();

    public virtual ICollection<WmsCycleCountLine> WmsCycleCountLines { get; set; } = new List<WmsCycleCountLine>();

    public virtual ICollection<WmsHandlingUnitContent> WmsHandlingUnitContents { get; set; } = new List<WmsHandlingUnitContent>();

    public virtual ICollection<WmsInboundAdviceLine> WmsInboundAdviceLines { get; set; } = new List<WmsInboundAdviceLine>();

    public virtual ICollection<WmsInventoryAllocation> WmsInventoryAllocations { get; set; } = new List<WmsInventoryAllocation>();

    public virtual ICollection<WmsInventoryBalance> WmsInventoryBalances { get; set; } = new List<WmsInventoryBalance>();

    public virtual ICollection<WmsInventoryHold> WmsInventoryHolds { get; set; } = new List<WmsInventoryHold>();

    public virtual ICollection<WmsInventoryLot> WmsInventoryLots { get; set; } = new List<WmsInventoryLot>();

    public virtual ICollection<WmsInventoryReservation> WmsInventoryReservations { get; set; } = new List<WmsInventoryReservation>();

    public virtual ICollection<WmsInventorySerial> WmsInventorySerials { get; set; } = new List<WmsInventorySerial>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsItemBarcode> WmsItemBarcodes { get; set; } = new List<WmsItemBarcode>();

    public virtual ICollection<WmsItemComplianceProfile> WmsItemComplianceProfiles { get; set; } = new List<WmsItemComplianceProfile>();

    public virtual ICollection<WmsItemUom> WmsItemUoms { get; set; } = new List<WmsItemUom>();

    public virtual ICollection<WmsOrderLine> WmsOrderLines { get; set; } = new List<WmsOrderLine>();

    public virtual ICollection<WmsReceiptLine> WmsReceiptLines { get; set; } = new List<WmsReceiptLine>();

    public virtual ICollection<WmsScanEvent> WmsScanEvents { get; set; } = new List<WmsScanEvent>();

    public virtual ICollection<WmsStorageRule> WmsStorageRules { get; set; } = new List<WmsStorageRule>();

    public virtual ICollection<WmsTask> WmsTasks { get; set; } = new List<WmsTask>();

    public virtual CmpUser? WmsitemCreatedByNavigation { get; set; }

    public virtual OrgMaster WmsitemCustomerOrg { get; set; } = null!;

    public virtual WmsFacility? WmsitemDefaultFacility { get; set; }
}
