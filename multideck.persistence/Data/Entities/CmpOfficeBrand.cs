using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CmpOfficeBrand
{
    public Guid OfficeBrandId { get; set; }

    public Guid OfficeId { get; set; }

    public Guid BrandId { get; set; }

    public bool OfficeBrandIsDefault { get; set; }

    public bool OfficeBrandIsActive { get; set; }

    public DateTime OfficeBrandCreatedAt { get; set; }

    public virtual CmpBrand Brand { get; set; } = null!;

    public virtual CmpOffice Office { get; set; } = null!;
}
