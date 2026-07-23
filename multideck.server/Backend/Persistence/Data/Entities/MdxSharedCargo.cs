using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxSharedCargo
{
    public Guid MdxcargoId { get; set; }

    public Guid MdxcargoSharedJobId { get; set; }

    public Guid? MdxcargoLocalCargoId { get; set; }

    public string? MdxcargoRemoteCargoId { get; set; }

    public string MdxcargoStatusCode { get; set; } = null!;

    public int? MdxcargoLineNo { get; set; }

    public string? MdxcargoDescription { get; set; }

    public string? MdxcargoCommodity { get; set; }

    public decimal? MdxcargoPieces { get; set; }

    public string? MdxcargoPackageTypeCodeSnapshot { get; set; }

    public decimal? MdxcargoPackageQty { get; set; }

    public decimal? MdxcargoGrossKilos { get; set; }

    public decimal? MdxcargoNettKilos { get; set; }

    public decimal? MdxcargoVolumeCbm { get; set; }

    public string? MdxcargoHscode { get; set; }

    public string? MdxcargoCountryOfOriginCodeSnapshot { get; set; }

    public bool MdxcargoIsHazardous { get; set; }

    public bool MdxcargoIsTemperatureControlled { get; set; }

    public string MdxcargoDimensionsJson { get; set; } = null!;

    public string MdxcargoDangerousGoodsJson { get; set; } = null!;

    public string MdxcargoMetadataJson { get; set; } = null!;

    public DateTime MdxcargoUpdatedAt { get; set; }

    public virtual MdxSharedJob MdxcargoSharedJob { get; set; } = null!;

    public virtual SysMdxrecordStatus MdxcargoStatusCodeNavigation { get; set; } = null!;
}
