# Contributions

Every member has to complete at least 2 meaningful tasks per week, where a
single development task should have a granularity of 0.5-1 day. The completed
tasks have to be shown in the weekly TA meetings. You have one "Joker" to miss
one weekly TA meeting and another "Joker" to once skip continuous progress over
the remaining weeks of the course. Please note that you cannot make up for
"missed" continuous progress, but you can "work ahead" by completing twice the
amount of work in one week to skip progress on a subsequent week without using
your "Joker". Please communicate your planning **ahead of time**.

Note: If a team member fails to show continuous progress after using their
Joker, they will individually fail the overall course (unless there is a valid
reason).

**You MUST**:

- Have two meaningful contributions per week.

**You CAN**:

- Have more than one commit per contribution.
- Have more than two contributions per week.
- Link issues to contributions descriptions for better traceability.

**You CANNOT**:

- Link the same commit more than once.
- Use a commit authored by another GitHub user.

---

## Contributions Week 1 - [23.03] to [29.03]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [28.03]   | [86c8e5d](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/86c8e5d) | Added login page | Needed for the website otherwise not usable |
|                    | [28.03]   | [e0d6bd1](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/e0d6bd1) | Added AuthGuard | So only logged in users can join courses |
| **[@AQuant1](https://github.com/AQuant1)** | [26.03] | [1a6fe87](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/1a6fe87179926dbdd86ab7e9b51a7935e1ee393e) | Added welcome page | sets the entry point of the web app |
|                    | [26.03] | [9da325f](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/9da325fc7c829d675a9de9485bee665de35d68ee) | Added Registration of both Student and Teacher | Allows the user to sing up |
| **[@Bablandan](https://github.com/Bablandan)** | [27.03]   | [0787fe2](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/0787fe2adbbb586cf5e083e6544f1272c91316c0) | Creating Course entity and CourseService, CourseController, CourseRepo and updated mapping such that creation of a course as a teacher is possible | It's necessary that courses can be created that later students can join them and sessions can be launched. Courses are only hosted by teachers. |
|                    | [27.03]   | [acf4246](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/acf4246184514a4ede31af7557201123085f0484); [969c22e](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/969c22ec312114b91cadaa3c944366ad28af5590) | Creating user entity including Service, Controller and Mapping as well as enumeration constant for user and teacher including POST-API for user registration | This is relevant because without user no courses can be created and it's important to distinguish between teacher/student. |
| **[@Meimira](https://github.com/Meimira)** | [28.03]   | [4b59c3f](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/4b59c3f95e3f6d0dc65bbc69c858c2b1145315c6) | Handling redirection after registration/ login and security for dashboard. | This is relevant because users must see their course overview after registration and only the authenticated role is allowed to see specific pages.|
|                    | [29.03]   | [739a176](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/739a17671fa7f429ce1d1acb40286c91a26b03ba); [2bf7f93](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/2bf7f936cf5545354f6c79191c60cacf4a87a225)  | Showing course overview for teachers and students individually | This relevant because users must see their courses they are enrolled in/ created. |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | [29.03]   | [05e7c25](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/05e7c258cc70dc71003993deccc75c742efc8fb7) | Add QR code generation and code generation | Part of the user story 3 |
|                    | [29.03]   | [0e106a0](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/0e106a07d2fd8e0aa93157907478d419ff90a46c)| Add course enrollment system | Part of the user story 3 |


---

## Contributions Week 2 - [30.03] to [05.04]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [05.04]   | [ef01221](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/ef01221) | added a logout button | So users can logout when finished with a session |
|                    | [05.04]   | [0b15d32](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/0b15d32) | Clearing local storage and redirecting after logout | That the logout works as intended |
| **[@AQuant1](https://github.com/AQuant1)** | [05.04] | [ba64841](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/ba648411bd990cedc830ae348592627886ac6cfe) | Added profile page and password change | Users need to view and update their credentials |
|                    | [05.04] | [d4f84db](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/d4f84db22544e88016ae582c7c483fd3a464d1e9) | Added join course page | Students need to join courses via course code |
| **[@Bablandan](https://github.com/Bablandan)** | [date]   | Joker | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | Joker| [Brief description of the task] | [Why this contribution is relevant] |
| **[@Meimira](https://github.com/Meimira)** | [05.04]   | [205740c](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/205740ce8e78230ba7bcc0d2d8a3e1f021bc8fe8) | Both dashboards (student and teacher) are now dynamic, meaning they only see their own courses they are enrolled in. Additionally the profil icon are now individual. | Users must see their own courses and no one elses. |
|                    | [05.04]   | [205740c](https://github.com/MoritzDav/sopra-fs26-group-04-client/commit/205740ce8e78230ba7bcc0d2d8a3e1f021bc8fe8) | Both dashboard have now links to the course page and the profile page. Additionally a teacher can now navigate to editCourse, delete his course and share the course code with the display of a QR Code | Users must be able to navigate to course page and their profile. A teacher must be able to delete and share his course. |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | [05.04]   | [c3d90aa](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/c3d90aafff9da0d7ae5af6e343b4430bfa92fd37) | Add course email generation and user retrieval functionality | Outlook message is part of the user story |
|                    | [05.04]   | [afba6b3](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/afba6b391334502362d0dff2ffeea3fdc2af87b8) | Implement user login and logout functionality+unit tests | essential for the app |

---

## Contributions Week 3 - [Begin date] to [End date]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [07.04]   | [1dc8e27](https://github.com/MoritzDav/sopra-fs26-group-04-server/commit/1dc8e27) | Added not blank annotations for username, firstname, lastname, password | So you cannot register with empty credentials |
|                    | [11.04]   | [[Link to Commit 2](https://github.com/MoritzDav/sopra-fs26-group-04-client/pull/47) | Created a whiteboard for the main functionality of the website | To draw, add notes, explain and share ideas |
| **[@AQuant1](https://github.com/AQuant1)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@Bablandan](https://github.com/Bablandan)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@Meimira](https://github.com/Meimira)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |

---

## Contributions Week 4 - [Begin Date] to [End Date]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@AQuant1](https://github.com/AQuant1)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@Bablandan](https://github.com/Bablandan)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@Meimira](https://github.com/Meimira)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |

---

## Contributions Week 5 - [Begin Date] to [End Date]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@AQuant1](https://github.com/AQuant1)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@Bablandan](https://github.com/Bablandan)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@Meimira](https://github.com/Meimira)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |

---

## Contributions Week 6 - [Begin Date] to [End Date]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@MoritzDav](https://github.com/MoritzDav)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@AQuant1](https://github.com/AQuant1)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@Bablandan](https://github.com/Bablandan)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@Meimira](https://github.com/Meimira)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@ValyaSorokivska](https://github.com/ValyaSorokivska)** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
