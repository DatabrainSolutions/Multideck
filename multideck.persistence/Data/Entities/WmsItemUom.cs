using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsItemUom
{
    public Guid WmsitemUomId { get; set; }

    public Guid WmsitemUomItemId { get; set; }

    public string WmsitemUomUomcode { get; set; } = null!;

    public decimal WmsitemUomQuantityInBaseUom { get; set; }

    public decimal? WmsitemUomLengthM { get; set; }

    public decimal? WmsitemUomWidthM { get; set; }

    public decimal? WmsitemUomHeightM { get; set; }

    public decimal? WmsitemUomGrossWeightKg { get; set; }

    public bool WmsitemUomIsPurchasingUom { get; set; }

    public bool WmsitemUomIsStockingUom { get; set; }

    public bool WmsitemUomIsSellingUom { get; set; }

    public virtual WmsItem WmsitemUomItem { get; set; } = null!;
}
