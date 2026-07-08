using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmpolicyStatus
{
    public string ClmpolicyStatusCode { get; set; } = null!;

    public string ClmpolicyStatusName { get; set; } = null!;

    public string? ClmpolicyStatusDescription { get; set; }

    public bool ClmpolicyStatusIsActivePolicy { get; set; }

    public bool ClmpolicyStatusIsActive { get; set; }

    public int ClmpolicyStatusSortOrder { get; set; }

    public virtual ICollection<ClmInsurancePolicy> ClmInsurancePolicies { get; set; } = new List<ClmInsurancePolicy>();
}
