using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsHandlingUnitContent
{
    public Guid WmshucontentId { get; set; }

    public Guid WmshucontentHuId { get; set; }

    public Guid WmshucontentItemId { get; set; }

    public Guid? WmshucontentLotId { get; set; }

    public Guid? WmshucontentSerialId { get; set; }

    public decimal WmshucontentQuantity { get; set; }

    public string WmshucontentUomcode { get; set; } = null!;

    public string WmshucontentInventoryStatusCode { get; set; } = null!;

    public string WmshucontentCustomsStatusCode { get; set; } = null!;

    public DateTime WmshucontentCreatedAt { get; set; }

    public virtual SysWmscustomsStatus WmshucontentCustomsStatusCodeNavigation { get; set; } = null!;

    public virtual WmsHandlingUnit WmshucontentHu { get; set; } = null!;

    public virtual SysWmsinventoryStatus WmshucontentInventoryStatusCodeNavigation { get; set; } = null!;

    public virtual WmsItem WmshucontentItem { get; set; } = null!;
}
