using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobLocation
{
    public Guid JobLocId { get; set; }

    public Guid JobLocJobId { get; set; }

    public string JobLocRole { get; set; } = null!;

    public int JobLocSequence { get; set; }

    public string? JobLocUnlocode { get; set; }

    public string? JobLocIatacode { get; set; }

    public string? JobLocNameSnapshot { get; set; }

    public Guid? JobLocAddressId { get; set; }

    public string? JobLocAddressSnapshot { get; set; }

    public string? JobLocCountryCodeSnapshot { get; set; }

    public string JobLocLocationJson { get; set; } = null!;

    public DateTime JobLocCreatedAt { get; set; }

    public virtual JobHeader JobLocJob { get; set; } = null!;

    public virtual SysJobLocationRole JobLocRoleNavigation { get; set; } = null!;
}
