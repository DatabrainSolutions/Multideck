using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmclaimType
{
    public string ClmclaimTypeCode { get; set; } = null!;

    public string ClmclaimTypeName { get; set; } = null!;

    public string? ClmclaimTypeDescription { get; set; }

    public bool ClmclaimTypeIsInsuranceRelated { get; set; }

    public bool ClmclaimTypeIsActive { get; set; }

    public int ClmclaimTypeSortOrder { get; set; }

    public virtual ICollection<ClmClaim> ClmClaims { get; set; } = new List<ClmClaim>();
}
