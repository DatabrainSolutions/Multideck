using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceInternalWatchlist
{
    public Guid TceinternalListId { get; set; }

    public string TceinternalListCode { get; set; } = null!;

    public string TceinternalListName { get; set; } = null!;

    public string TceinternalListListTypeCode { get; set; } = null!;

    public Guid? TceinternalListOrgOfficeId { get; set; }

    public Guid? TceinternalListLegalEntityId { get; set; }

    public Guid? TceinternalListBrandId { get; set; }

    public bool TceinternalListIsActive { get; set; }

    public string? TceinternalListNotes { get; set; }

    public DateTime TceinternalListCreatedAt { get; set; }

    public Guid? TceinternalListCreatedBy { get; set; }

    public virtual CmpBrand? TceinternalListBrand { get; set; }

    public virtual CmpUser? TceinternalListCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? TceinternalListLegalEntity { get; set; }

    public virtual SysTcelistType TceinternalListListTypeCodeNavigation { get; set; } = null!;

    public virtual CmpOffice? TceinternalListOrgOffice { get; set; }
}
