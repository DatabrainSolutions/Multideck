using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommThreadParticipant
{
    public Guid CommThreadPartId { get; set; }

    public Guid CommThreadPartThreadId { get; set; }

    public string CommThreadPartParticipantTypeCode { get; set; } = null!;

    public Guid? CommThreadPartIdentityId { get; set; }

    public Guid? CommThreadPartOrgId { get; set; }

    public Guid? CommThreadPartContactId { get; set; }

    public Guid? CommThreadPartUserId { get; set; }

    public string? CommThreadPartDisplayNameSnapshot { get; set; }

    public string? CommThreadPartAddressSnapshot { get; set; }

    public string? CommThreadPartRole { get; set; }

    public bool CommThreadPartIsExternal { get; set; }

    public bool CommThreadPartIsPrimary { get; set; }

    public DateTime CommThreadPartCreatedAt { get; set; }

    public virtual OrgContact? CommThreadPartContact { get; set; }

    public virtual CommIdentity? CommThreadPartIdentity { get; set; }

    public virtual OrgMaster? CommThreadPartOrg { get; set; }

    public virtual SysCommParticipantType CommThreadPartParticipantTypeCodeNavigation { get; set; } = null!;

    public virtual CommThread CommThreadPartThread { get; set; } = null!;

    public virtual CmpUser? CommThreadPartUser { get; set; }
}
