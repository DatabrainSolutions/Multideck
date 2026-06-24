using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class OrgContactEmail
{
    public Guid OrgContactEmailId { get; set; }

    public string OrgContactEmailEmail { get; set; } = null!;

    public int OrgContactEmailType { get; set; }

    public Guid OrgContactId { get; set; }

    public virtual OrgContact OrgContact { get; set; } = null!;
}
