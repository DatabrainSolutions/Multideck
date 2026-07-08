using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsbondedWarehouseType
{
    public string WmsbondedWarehouseTypeCode { get; set; } = null!;

    public string WmsbondedWarehouseTypeName { get; set; } = null!;

    public string? WmsbondedWarehouseTypeDescription { get; set; }

    public string? WmsbondedWarehouseTypeJurisdictionHint { get; set; }

    public bool WmsbondedWarehouseTypeIsActive { get; set; }

    public int WmsbondedWarehouseTypeSortOrder { get; set; }

    public virtual ICollection<WmsBondedAuthorisation> WmsBondedAuthorisations { get; set; } = new List<WmsBondedAuthorisation>();
}
