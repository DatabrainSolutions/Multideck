using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class OrgContact
{
    public Guid OrgContactId { get; set; }

    public Guid OrgId { get; set; }

    public string? OrgContactFirstName { get; set; }

    public string? OrgContactLastName { get; set; }

    public virtual OrgMaster Org { get; set; } = null!;

    public virtual ICollection<OrgContactEmail> OrgContactEmails { get; set; } = new List<OrgContactEmail>();
}
