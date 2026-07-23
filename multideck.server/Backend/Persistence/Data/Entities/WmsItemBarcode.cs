using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsItemBarcode
{
    public Guid WmsitemBarcodeId { get; set; }

    public Guid WmsitemBarcodeItemId { get; set; }

    public string WmsitemBarcodeBarcode { get; set; } = null!;

    public string WmsitemBarcodeBarcodeTypeCode { get; set; } = null!;

    public string? WmsitemBarcodeUomcode { get; set; }

    public decimal WmsitemBarcodeQuantityPerBarcode { get; set; }

    public bool WmsitemBarcodeIsPrimary { get; set; }

    public bool WmsitemBarcodeIsActive { get; set; }

    public DateTime WmsitemBarcodeCreatedAt { get; set; }

    public virtual WmsItem WmsitemBarcodeItem { get; set; } = null!;
}
