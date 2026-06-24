using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class OrgMaster
{
    public Guid OrgId { get; set; }

    public string OrgName { get; set; } = null!;

    public Guid? OrgBaseCurrency { get; set; }

    public virtual ICollection<AccAptransHeader> AccAptransHeaders { get; set; } = new List<AccAptransHeader>();

    public virtual ICollection<OrgAddress> OrgAddresses { get; set; } = new List<OrgAddress>();

    public virtual ICollection<OrgContact> OrgContacts { get; set; } = new List<OrgContact>();

    public virtual ICollection<OrgType> OrgTypes { get; set; } = new List<OrgType>();
}
