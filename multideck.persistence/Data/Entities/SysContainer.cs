using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysContainer
{
    public Guid? RcPk { get; set; }

    public string? RcCode { get; set; }

    public bool? RcIsActive { get; set; }

    public string? RcShippingMode { get; set; }

    public string? RcDescription { get; set; }

    public string? RcLength { get; set; }

    public string? RcHeight { get; set; }

    public string? RcWidth { get; set; }

    public string? RcContainerType { get; set; }

    public bool? RcIsHighCube { get; set; }

    public bool? RcHasTynes { get; set; }

    public bool? RcHasVents { get; set; }

    public bool? RcIsIso { get; set; }

    public string? RcIsotype { get; set; }

    public string? RcTareWeight { get; set; }

    public string? RcGrossWeight { get; set; }

    public string? RcCubicCapacity { get; set; }

    public string? RcStorageClass { get; set; }

    public string? RcHandlingRateClass { get; set; }

    public string? RcFreightRateClass { get; set; }

    public string? RcIatarateClass { get; set; }

    public string? RcUscontainerCode { get; set; }

    public string? RcTeu { get; set; }

    public string? RcIsoequipmentSizeTypeCode { get; set; }

    public DateTime? RcSystemCreateTimeUtc { get; set; }

    public string? RcSystemCreateUser { get; set; }

    public DateTime? RcSystemLastEditTimeUtc { get; set; }

    public string? RcSystemLastEditUser { get; set; }

    public bool? RcIsSystem { get; set; }

    public string? RcContour { get; set; }

    public string? RcInsideHeight { get; set; }

    public string? RcInsideLength { get; set; }

    public string? RcInsideWidth { get; set; }

    public string? RcNetWeight { get; set; }

    public string? RcCubicCapacityUq { get; set; }

    public string? RcDimensionUq { get; set; }

    public string? RcDoorOpeningHeight { get; set; }

    public string? RcDoorOpeningUq { get; set; }

    public string? RcDoorOpeningWidth { get; set; }

    public string? RcInsideUq { get; set; }

    public bool? RcIsControlledAtmosphere { get; set; }

    public string? RcWeightUq { get; set; }
}
