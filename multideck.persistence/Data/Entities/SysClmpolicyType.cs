using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmpolicyType
{
    public string ClmpolicyTypeCode { get; set; } = null!;

    public string ClmpolicyTypeName { get; set; } = null!;

    public string? ClmpolicyTypeDescription { get; set; }

    public bool ClmpolicyTypeIsActive { get; set; }

    public int ClmpolicyTypeSortOrder { get; set; }

    public virtual ICollection<ClmInsurancePolicy> ClmInsurancePolicies { get; set; } = new List<ClmInsurancePolicy>();
}
