using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmActivityParticipant
{
    public Guid CrmactPartId { get; set; }

    public Guid CrmactPartActivityId { get; set; }

    public Guid? CrmactPartOrgId { get; set; }

    public Guid? CrmactPartOrgContactId { get; set; }

    public Guid? CrmactPartUserId { get; set; }

    public string? CrmactPartNameSnapshot { get; set; }

    public string? CrmactPartEmailSnapshot { get; set; }

    public string? CrmactPartRole { get; set; }

    public bool CrmactPartIsExternal { get; set; }

    public virtual CrmActivity CrmactPartActivity { get; set; } = null!;

    public virtual OrgMaster? CrmactPartOrg { get; set; }

    public virtual OrgContact? CrmactPartOrgContact { get; set; }

    public virtual CmpUser? CrmactPartUser { get; set; }
}
