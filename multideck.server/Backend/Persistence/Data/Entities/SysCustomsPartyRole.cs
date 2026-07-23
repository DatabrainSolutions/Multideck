using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCustomsPartyRole
{
    public string CprCode { get; set; } = null!;

    public string CprName { get; set; } = null!;

    public string? CprDescription { get; set; }

    public bool CprIsRequiredTypical { get; set; }

    public int CprSortOrder { get; set; }

    public bool CprIsActive { get; set; }

    public DateTime CprCreatedAt { get; set; }

    public virtual ICollection<CdsParty> CdsParties { get; set; } = new List<CdsParty>();

    public virtual ICollection<CustomsParty> CustomsParties { get; set; } = new List<CustomsParty>();

    public virtual ICollection<T1Party> T1Parties { get; set; } = new List<T1Party>();
}
