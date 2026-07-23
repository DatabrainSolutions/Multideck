using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsPackage
{
    public Guid WmspackageId { get; set; }

    public Guid WmspackageOrderId { get; set; }

    public Guid? WmspackageHuId { get; set; }

    public string WmspackagePackageNumber { get; set; } = null!;

    public string? WmspackageTrackingNumber { get; set; }

    public Guid? WmspackageCarrierOrgId { get; set; }

    public decimal? WmspackageGrossWeightKg { get; set; }

    public decimal? WmspackageVolumeCbm { get; set; }

    public Guid? WmspackageLabelDocumentId { get; set; }

    public DateTime WmspackageCreatedAt { get; set; }

    public virtual OrgMaster? WmspackageCarrierOrg { get; set; }

    public virtual WmsHandlingUnit? WmspackageHu { get; set; }

    public virtual WmsOrder WmspackageOrder { get; set; } = null!;
}
